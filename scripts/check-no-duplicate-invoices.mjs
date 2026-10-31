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
//   1. Read-only audit of the REAL DB (DIRECT_URL) — no exact-duplicate groups
//      may exist. VPS only: it needs the real data, which CI cannot reach.
//   2. Write test on a THROWAWAY database (created + dropped here, never the
//      real data) proving BOTH the partial index (protecting new data now) and
//      the eventual full index reject a repeated identical insert, allow a
//      genuinely different document (different doc_type), and — for the partial
//      index — leave legacy rows (before the anchor) untouched.
//      It needs nothing from the app (no migrations, extensions or schema — it
//      builds its own 6-column table) but a Postgres it may create databases
//      on. That Postgres comes ONLY from CHECK_DUPES_ISOLATED_URL — the CI
//      `dupes-isolated` job's service container — and never from DIRECT_URL;
//      isolatedDbUrl() refuses anything that is or could be production. On the
//      VPS the variable is unset, so part 2 is SKIPPED (loudly, not as a ✓).
//
// Usage: node scripts/check-no-duplicate-invoices.mjs [--part=1|2]  (default: both)
//
// NOTE: legitimately-distinct documents sharing (vendor, doc_number, doc_type)
// but differing in content (a re-scan/rename twin, manual-vs-folder) are NOT
// exact duplicates — surfaced here as info for human resolution, not a failure.
// See TESTING.md.
import { run, psql, scalar, fail, ok, info, isolatedDbUrl } from './_lib.mjs'

const PART = (process.argv.find((a) => a.startsWith('--part=')) ?? '--part=all').slice('--part='.length)
if (!['1', '2', 'all'].includes(PART)) {
  console.error(`unknown --part=${PART} (use --part=1, --part=2, or omit for both)`)
  process.exit(2)
}
const ISOLATED_ENV = 'CHECK_DUPES_ISOLATED_URL'

const SIG = `md5(
  coalesce(total::text,'')||'|'||coalesce(pretax::text,'')||'|'||coalesce(vat::text,'')||'|'||
  coalesce(date,'')||'|'||coalesce(currency,'')||'|'||coalesce(description,'')||'|'||
  coalesce(payment_method,'')||'|'||coalesce(category,'')||'|'||coalesce(file_name,'')||'|'||
  coalesce(source,'')||'|'||coalesce(doc_type,''))`

function auditRealDb() {
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
}

async function isolatedWriteTest() {
  // --- Part 2: prove the prevention mechanism on a throwaway DB -----------
  // A SEPARATE database on a disposable cluster, fully isolated, dropped in
  // finally. The cluster is never the real one — see the header.
  if (PART === 'all' && !process.env[ISOLATED_ENV]) {
    info(`⏭ חלק 2 (DB חד"פ) דולג — ${ISOLATED_ENV} לא מוגדר. הוא רץ ב-CI (job dupes-isolated) ולעולם לא על ה-DB האמיתי. זה לא ✓: חלק 2 לא נבדק בהרצה הזו.`)
    return
  }
  let admin
  try {
    admin = isolatedDbUrl(ISOLATED_ENV)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
  if (new URL(admin).pathname.length <= 1) return fail(`${ISOLATED_ENV} חייב לכלול שם מסד (…/postgres)`)
  const adminSql = (sql) => psql(sql, { url: admin, args: ['-c'] })
  const adminScalar = (sql) => scalar(sql, { url: admin })

  // Last line of defence, after the textual guard: a disposable cluster holds
  // no databases besides the defaults and has no invoices table. The real
  // cluster has both. Catalog reads only; nothing is created before this passes.
  const foreignDbs = adminScalar(`select count(*) from pg_database where datname not in ('postgres','template0','template1')`)
  const hasInvoices = adminScalar(`select to_regclass('public.invoices') is not null`)
  if (foreignDbs !== '0' || hasInvoices === 't') {
    return fail(`${ISOLATED_ENV} מצביע על cluster שאינו חד-פעמי (יש בו מסדים נוספים או טבלת invoices) — מסרב ליצור בו מסד`)
  }
  info(`חלק 2 רץ על Postgres ${adminScalar('show server_version')} חד-פעמי`)
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

  adminSql(`create database "${tmpName}"`)
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
    adminSql(`drop database if exists "${tmpName}" with (force)`)
    info('DB חד"פ נמחק')
  }
}

run('check-no-duplicate-invoices', async () => {
  if (PART !== '2') auditRealDb()
  if (PART !== '1') await isolatedWriteTest()
})
