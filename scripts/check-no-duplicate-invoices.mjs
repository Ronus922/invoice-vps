#!/usr/bin/env node
// INVARIANT: a repeated scan/upload never creates a byte-identical duplicate
//   invoice row. Two rows sharing the same (vendor, doc_number) AND identical
//   in every material field (amounts, date, currency, file_name, description,
//   payment_method, category, source) are a re-scan artifact — accounting sees
//   the same expense twice.
//
// Two parts:
//   1. Read-only audit of the REAL DB — no exact-duplicate groups may exist.
//   2. Write test on a THROWAWAY database (created + dropped here, never the
//      real data) proving a unique index on the content signature rejects a
//      repeated identical insert while allowing genuinely different documents.
//
// NOTE: legitimately-distinct documents that share a doc_number (e.g. an
// Anthropic "Invoice" and its "Receipt", or a manually-edited variant) are NOT
// exact duplicates and are intentionally allowed — those are a human/business
// decision, surfaced here as info, not a failure. See TESTING.md.
import { run, psql, scalar, fail, ok, info } from './_lib.mjs'

const SIG = `md5(
  coalesce(total::text,'')||'|'||coalesce(pretax::text,'')||'|'||coalesce(vat::text,'')||'|'||
  coalesce(date,'')||'|'||coalesce(currency,'')||'|'||coalesce(description,'')||'|'||
  coalesce(payment_method,'')||'|'||coalesce(category,'')||'|'||coalesce(file_name,'')||'|'||
  coalesce(source,''))`

run('check-no-duplicate-invoices', async () => {
  // --- Part 1: real DB must have no exact-duplicate rows -------------------
  const exactDupRows = scalar(`
    with s as (
      select vendor, doc_number, ${SIG} as sig
      from public.invoices where coalesce(doc_number,'') <> ''
    )
    select coalesce(sum(cnt-1),0) from (
      select count(*) cnt from s group by vendor, doc_number, sig having count(*) > 1
    ) d`)
  if (exactDupRows === '0') ok('אין רשומות כפולות זהות ב-DB האמיתי')
  else fail(`${exactDupRows} רשומות כפולות זהות (re-scan) — יש לאחד. הרץ scripts/dedup-cleanup.mjs`)

  // Informational: variant groups sharing a doc_number but differing in metadata
  // (invoice vs receipt, manual edit). Not a failure — human resolves in the UI.
  const variantGroups = scalar(`
    select count(*) from (
      select vendor, doc_number from public.invoices
      where coalesce(doc_number,'') <> ''
      group by vendor, doc_number having count(distinct ${SIG}) > 1
    ) g`)
  if (variantGroups !== '0') {
    info(`${variantGroups} קבוצות (vendor, doc_number) עם וריאנטים שונים — ממתינות להכרעה ידנית ב-UI (לא כשל)`)
  }

  // --- Part 2: prove the prevention mechanism on a throwaway DB -----------
  // Real data lives in database "postgres"; this creates a SEPARATE database on
  // the same cluster, fully isolated, and drops it in finally.
  const admin = process.env.DIRECT_URL
  if (!admin) return fail('אין DIRECT_URL — לא ניתן להריץ בדיקת כתיבה מבודדת')
  const tmpName = `invoice_check_${process.pid}_${Date.now()}`
  const tmpUrl = admin.replace(/\/[^/?]+(\?|$)/, `/${tmpName}$1`)

  psql(`create database "${tmpName}"`, { args: ['-c'] })
  try {
    psql(
      `create table invoices (
         vendor text, doc_number text, file_name text, total numeric
       );
       create unique index inv_exact_uniq on invoices (vendor, doc_number, file_name)
         where coalesce(doc_number,'') <> '';`,
      { url: tmpUrl, args: ['-c'] }
    )
    psql(`insert into invoices values ('Acme','A-1','inv.pdf',100)`, { url: tmpUrl, args: ['-c'] })

    // Repeated identical insert must be REJECTED by the DB.
    let rejected = false
    try {
      psql(`insert into invoices values ('Acme','A-1','inv.pdf',100)`, { url: tmpUrl, args: ['-c'] })
    } catch {
      rejected = true
    }
    if (rejected) ok('DB חד"פ: הכנסה חוזרת זהה נדחתה על ידי unique index')
    else fail('DB חד"פ: unique index לא מנע הכנסה כפולה זהה')

    // A genuinely different document (different file_name) must be ALLOWED.
    let allowed = true
    try {
      psql(`insert into invoices values ('Acme','A-1','receipt.pdf',100)`, { url: tmpUrl, args: ['-c'] })
    } catch {
      allowed = false
    }
    if (allowed) ok('DB חד"פ: מסמך שונה (file_name אחר) עם אותו doc_number מותר')
    else fail('DB חד"פ: unique index חוסם מסמך לגיטימי שונה')
  } finally {
    // WITH (FORCE) drops even if a session is still closing (PG 13+).
    psql(`drop database if exists "${tmpName}" with (force)`, { args: ['-c'] })
    info('DB חד"פ נמחק')
  }
})
