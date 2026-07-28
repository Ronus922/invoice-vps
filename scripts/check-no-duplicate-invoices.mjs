#!/usr/bin/env node
// INVARIANT: a repeated scan/upload never creates a byte-identical duplicate
//   invoice row. Document identity is (vendor, doc_number, doc_type) — a vendor
//   can legitimately issue an Invoice AND a Receipt (or חשבונית מס / קבלה /
//   חשבונית מס-קבלה / חשבונית זיכוי) under one number, so the type is part of the
//   key. Two rows sharing that key AND identical in every material field
//   (amounts, date, currency, file_name, description, payment_method, category,
//   source, doc_type) are a re-scan artifact — accounting sees one expense twice.
//
// Two parts:
//   1. Read-only audit of the REAL DB — no exact-duplicate groups may exist.
//   2. Write test on a THROWAWAY database (created + dropped here, never the
//      real data) proving BOTH the partial index (protecting new data now) and
//      the eventual full index reject a repeated identical insert, allow a
//      genuinely different document (different doc_type), and — for the partial
//      index — leave legacy rows (before the anchor) untouched.
//
// NOTE: legitimately-distinct documents sharing (vendor, doc_number, doc_type)
// but differing in content (a re-scan/rename twin, manual-vs-folder) are NOT
// exact duplicates — surfaced here as info for human resolution, not a failure.
// See TESTING.md.
import { run, psql, scalar, fail, ok, info } from './_lib.mjs'

const SIG = `md5(
  coalesce(total::text,'')||'|'||coalesce(pretax::text,'')||'|'||coalesce(vat::text,'')||'|'||
  coalesce(date,'')||'|'||coalesce(currency,'')||'|'||coalesce(description,'')||'|'||
  coalesce(payment_method,'')||'|'||coalesce(category,'')||'|'||coalesce(file_name,'')||'|'||
  coalesce(source,'')||'|'||coalesce(doc_type,''))`

run('check-no-duplicate-invoices', async () => {
  // --- Part 1: real DB must have no exact-duplicate rows -------------------
  const exactDupRows = scalar(`
    with s as (
      select vendor, doc_number, doc_type, ${SIG} as sig
      from public.invoices where coalesce(doc_number,'') <> ''
    )
    select coalesce(sum(cnt-1),0) from (
      select count(*) cnt from s group by vendor, doc_number, doc_type, sig having count(*) > 1
    ) d`)
  if (exactDupRows === '0') ok('אין רשומות כפולות זהות ב-DB האמיתי')
  else fail(`${exactDupRows} רשומות כפולות זהות (re-scan) — יש לאחד. הרץ scripts/dedup-cleanup.mjs`)

  // Informational: variant groups sharing the identity key (vendor, doc_number,
  // doc_type) but differing in content — re-scan/rename twins, manual vs folder.
  // Not a failure — Ronen resolves these in the UI (see TESTING.md).
  const variantGroups = scalar(`
    select count(*) from (
      select vendor, doc_number, doc_type from public.invoices
      where coalesce(doc_number,'') <> ''
      group by vendor, doc_number, doc_type having count(distinct ${SIG}) > 1
    ) g`)
  if (variantGroups !== '0') {
    info(`${variantGroups} קבוצות (vendor, doc_number, doc_type) עם וריאנטים — ממתינות להכרעה ידנית ב-UI (לא כשל)`)
  }

  // --- Part 2: prove the prevention mechanism on a throwaway DB -----------
  // Real data lives in database "postgres"; this creates a SEPARATE database on
  // the same cluster, fully isolated, and drops it in finally.
  const admin = process.env.DIRECT_URL
  if (!admin) return fail('אין DIRECT_URL — לא ניתן להריץ בדיקת כתיבה מבודדת')
  const tmpName = `invoice_check_${process.pid}_${Date.now()}`
  const tmpUrl = admin.replace(/\/[^/?]+(\?|$)/, `/${tmpName}$1`)

  // A row inserted with created_at exactly at the anchor is "new" (>= anchor);
  // one strictly before it is "legacy". The partial index must cover the former
  // and ignore the latter.
  const ANCHOR = '2000-01-02 00:00:00+00'
  const NEW_CA = `'2000-01-02 00:00:00+00'`   // >= anchor  → covered
  const OLD_CA = `'2000-01-01 00:00:00+00'`   // <  anchor  → legacy, not covered

  const tryInsert = (vals) => {
    try {
      psql(`insert into invoices (vendor, doc_number, doc_type, file_name, total, created_at) values ${vals}`,
        { url: tmpUrl, args: ['-c'] })
      return true
    } catch {
      return false
    }
  }

  psql(`create database "${tmpName}"`, { args: ['-c'] })
  try {
    psql(
      `create table invoices (
         vendor text, doc_number text, doc_type text not null default 'unknown',
         file_name text, total numeric, created_at timestamptz not null default now()
       );`,
      { url: tmpUrl, args: ['-c'] }
    )

    // ===== Partial index — protects new data, grandfathers legacy =====
    psql(
      `create unique index inv_partial_uniq on invoices (vendor, doc_number, doc_type)
         where coalesce(doc_number,'') <> '' and created_at >= '${ANCHOR}';`,
      { url: tmpUrl, args: ['-c'] }
    )

    // baseline NEW row
    if (!tryInsert(`('Acme','A-1','invoice','inv.pdf',100,${NEW_CA})`))
      fail('DB חד"פ: הכנסת שורה חדשה בסיסית נכשלה')

    // repeated identical NEW key → REJECTED
    if (!tryInsert(`('Acme','A-1','invoice','inv.pdf',100,${NEW_CA})`))
      ok('DB חד"פ (חלקי): הכנסה חוזרת זהה נדחתה')
    else fail('DB חד"פ (חלקי): unique index לא מנע הכנסה כפולה זהה')

    // same number, DIFFERENT doc_type (Invoice vs Receipt) → ALLOWED
    if (tryInsert(`('Acme','A-1','receipt','rcpt.pdf',100,${NEW_CA})`))
      ok('DB חד"פ (חלקי): doc_type שונה (invoice מול receipt) עם אותו מספר מותר')
    else fail('DB חד"פ (חלקי): unique index חוסם doc_type שונה לגיטימי')

    // LEGACY duplicate (before the anchor) → ALLOWED (partial index ignores it)
    if (tryInsert(`('Legacy','L-1','invoice','a.pdf',50,${OLD_CA})`) &&
        tryInsert(`('Legacy','L-1','invoice','a.pdf',50,${OLD_CA})`))
      ok('DB חד"פ (חלקי): כפילות legacy (לפני העוגן) אינה נחסמת — מגן רק על חדש')
    else fail('DB חד"פ (חלקי): האינדקס החלקי חסם שורת legacy — עוגן שגוי')

    // ===== Full index — the eventual state after Ronen closes the groups =====
    psql(`drop index inv_partial_uniq; delete from invoices;`, { url: tmpUrl, args: ['-c'] })
    psql(
      `create unique index inv_full_uniq on invoices (vendor, doc_number, doc_type)
         where coalesce(doc_number,'') <> '';`,
      { url: tmpUrl, args: ['-c'] }
    )

    if (!tryInsert(`('Acme','A-1','invoice','inv.pdf',100,${OLD_CA})`))
      fail('DB חד"פ (מלא): הכנסת שורה בסיסית נכשלה')
    // full index covers legacy timestamps too → repeated identical REJECTED
    if (!tryInsert(`('Acme','A-1','invoice','inv.pdf',100,${OLD_CA})`))
      ok('DB חד"פ (מלא): הכנסה חוזרת זהה נדחתה (גם ללא תלות בתאריך)')
    else fail('DB חד"פ (מלא): unique index לא מנע הכנסה כפולה זהה')
    // different doc_type still allowed
    if (tryInsert(`('Acme','A-1','receipt','rcpt.pdf',100,${OLD_CA})`))
      ok('DB חד"פ (מלא): doc_type שונה עם אותו מספר מותר')
    else fail('DB חד"פ (מלא): unique index חוסם doc_type שונה לגיטימי')
  } finally {
    // WITH (FORCE) drops even if a session is still closing (PG 13+).
    psql(`drop database if exists "${tmpName}" with (force)`, { args: ['-c'] })
    info('DB חד"פ נמחק')
  }
})
