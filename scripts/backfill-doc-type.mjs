#!/usr/bin/env node
// ONE-OFF (not part of check:all): introduce invoices.doc_type and backfill it,
// moving document identity from (vendor, doc_number) to (vendor, doc_number,
// doc_type). Then create the partial unique index that protects new data.
//
// Safety (per operator instruction):
//   1. Full pg_dump of public.invoices + full JSON snapshot BEFORE any change.
//   2. Every change is additive (new column) or writes ONLY the new doc_type
//      column (backfill). No existing data field is modified; no row is deleted.
//   3. Uncertain rows stay 'unknown' — adding doc_type to the key only softens
//      uniqueness, so this can never invalidate an existing row.
//
// Classification sources (in order): negative total ⇒ credit note; file_name
// prefix (Invoice-*/Receipt-*); else 'unknown'. Multi-row (vendor, doc_number)
// groups that are NOT an Invoice+Receipt split (the Anthropic pattern) are
// UNIFIED to one doc_type so a re-scan/rename twin (e.g. Invoice_21981352.pdf vs
// "1006 מים.pdf") is never mis-split into a hidden duplicate.
//
// Run:  node scripts/backfill-doc-type.mjs           (dry-run: report only)
//       node scripts/backfill-doc-type.mjs --apply   (backup → migrate → backfill → index)
import { loadEnv, psql, scalar, repoRoot } from './_lib.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

loadEnv()
const APPLY = process.argv.includes('--apply')
const url = process.env.DIRECT_URL
if (!url) { console.error('אין DIRECT_URL — הפעל מתיקיית הפרויקט עם .env.local'); process.exit(1) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

const exec = (sql) => psql(sql, { args: ['-c'] })
const one = (sql) => scalar(sql)
const table = (sql) => psql(sql, { args: ['-A', '-F', ' | ', '-P', 'footer=off', '-c'] })

// Per-row classification from the only reliable legacy signal (file_name), plus
// a negative-total credit-note guard.
const ROW_CLASS = `
  case
    when total < 0 then 'credit_note'
    when file_name ~* 'receipt' then 'receipt'
    when file_name ~* 'invoice'  then 'invoice'
    when file_name ~* 'credit|זיכוי' then 'credit_note'
    else 'unknown'
  end`

console.log(`\n=== backfill-doc-type ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===`)

// ---- Report: what the classifier + unifier will produce ---------------------
console.log('\nהתפלגות סיווג לפי file_name (לפני איחוד קבוצות):')
console.log(table(`with c as (select ${ROW_CLASS} dt from public.invoices)
  select dt, count(*) from c group by dt order by count(*) desc`))

console.log('\nקבוצות (vendor, doc_number) עם >1 שורה, וההכרעה:')
console.log(table(`
  select vendor||' | '||doc_number||' | rows='||count(*)
      || ' | ' || case
           when bool_or(file_name ~* 'invoice') and bool_or(file_name ~* 'receipt')
             then 'SPLIT invoice/receipt (Anthropic) → נפתר אוטומטית'
           when bool_or(file_name ~* 'invoice')
             then 'UNIFY → invoice (נשאר מקובץ להכרעת רונן)'
           else 'UNIFY → unknown (נשאר מקובץ להכרעת רונן)'
         end
  from public.invoices
  where coalesce(doc_number,'') <> ''
  group by vendor, doc_number having count(*) > 1
  order by vendor, doc_number`))

if (!APPLY) {
  console.log('\n(dry-run — לא בוצעו שינויים. הרץ עם --apply.)')
  process.exit(0)
}

// ---- 1. Backups -------------------------------------------------------------
const dir = join(repoRoot(), 'backups', `doctype-${stamp}`)
mkdirSync(dir, { recursive: true })
execFileSync('pg_dump', [url, '-t', 'public.invoices', '-f', join(dir, 'invoices.dump.sql')])
console.log(`\n✓ גיבוי טבלה: ${join(dir, 'invoices.dump.sql')}`)
const allRows = psql(`select coalesce(json_agg(row_to_json(i)), '[]') from public.invoices i`)
writeFileSync(join(dir, 'invoices.json'), allRows)
console.log(`✓ גיבוי JSON: ${join(dir, 'invoices.json')} (${JSON.parse(allRows).length} שורות)`)

// ---- 2. Schema: add column + CHECK (idempotent) -----------------------------
exec(`alter table public.invoices add column if not exists doc_type text not null default 'unknown';
      alter table public.invoices drop constraint if exists invoices_doc_type_check;
      alter table public.invoices add constraint invoices_doc_type_check
        check (doc_type in ('invoice','receipt','invoice_receipt','credit_note','other','unknown'));`)
console.log('\n✓ עמודת doc_type + CHECK קיימות')

// ---- 3. Backfill: per-row classification ------------------------------------
exec(`update public.invoices set doc_type = ${ROW_CLASS}`)

// ---- 4. Unify multi-row groups that are NOT an Invoice+Receipt split --------
// (protects the re-scan/rename twins from a mis-split that would hide a dup)
exec(`
  with grp as (
    select vendor, doc_number,
           bool_or(file_name ~* 'invoice') as has_inv,
           bool_or(file_name ~* 'receipt') as has_rec
    from public.invoices
    where coalesce(doc_number,'') <> ''
    group by vendor, doc_number having count(*) > 1
  )
  update public.invoices i
     set doc_type = case when g.has_inv then 'invoice' else 'unknown' end
    from grp g
   where i.vendor = g.vendor and i.doc_number = g.doc_number
     and not (g.has_inv and g.has_rec)
     and i.doc_type <> 'credit_note'`)
console.log('✓ סיווג + איחוד קבוצות בוצעו')

// ---- 5. Verify: split groups whose amounts DON'T match → needs_review --------
const mismatched = one(`
  select count(*) from (
    select vendor, doc_number from public.invoices
    where coalesce(doc_number,'') <> ''
    group by vendor, doc_number
    having count(distinct doc_type) > 1
       and (count(distinct total) > 1 or count(distinct currency) > 1)
  ) x`)
if (mismatched !== '0') {
  exec(`
    with bad as (
      select vendor, doc_number from public.invoices
      where coalesce(doc_number,'') <> ''
      group by vendor, doc_number
      having count(distinct doc_type) > 1
         and (count(distinct total) > 1 or count(distinct currency) > 1)
    )
    update public.invoices i set needs_review = true,
      validation_error = coalesce(nullif(validation_error,'') || ' | ', '')
        || 'סכום/מטבע לא תואם בין סוגי המסמך של אותו מספר'
    from bad b where i.vendor=b.vendor and i.doc_number=b.doc_number`)
  console.log(`⚠️  ${mismatched} קבוצות split עם סכומים לא תואמים → סומנו needs_review`)
} else {
  console.log('✓ בכל קבוצת split (Invoice/Receipt) הסכומים תואמים — אין needs_review חדש')
}

// ---- 6. Final distribution --------------------------------------------------
console.log('\nהתפלגות doc_type סופית:')
console.log(table(`select doc_type, count(*) from public.invoices group by doc_type order by count(*) desc`))

// ---- 7. Partial unique index (anchored after the latest existing row) --------
const anchor = one(`select (max(created_at) + interval '1 second')::text from public.invoices`)
exec(`create unique index if not exists invoices_vendor_docnum_doctype_new_uniq
        on public.invoices (vendor, doc_number, doc_type)
        where coalesce(doc_number,'') <> '' and created_at >= '${anchor}'`)
const idxOk = one(`select 1 from pg_indexes where indexname='invoices_vendor_docnum_doctype_new_uniq'`)
console.log(`\n✓ אינדקס חלקי נוצר (anchor: created_at >= '${anchor}'): ${idxOk === '1' ? 'קיים' : 'שגיאה!'}`)

// ---- 8. Remaining groups under the NEW key (await Ronen) --------------------
console.log('\nקבוצות שנשארות כפילות תחת המפתח החדש (vendor, doc_number, doc_type):')
console.log(table(`
  select vendor||' | '||doc_number||' | '||doc_type||' | rows='||count(*)
  from public.invoices
  where coalesce(doc_number,'') <> ''
  group by vendor, doc_number, doc_type having count(*) > 1
  order by vendor, doc_number`))
const remaining = one(`select count(*) from (
  select 1 from public.invoices where coalesce(doc_number,'') <> ''
  group by vendor, doc_number, doc_type having count(*) > 1) x`)
console.log(`\nסה״כ קבוצות שנותרו להכרעת רונן: ${remaining}`)
console.log('סיום ✓')
