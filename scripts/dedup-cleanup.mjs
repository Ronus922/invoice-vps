#!/usr/bin/env node
// ONE-OFF (not part of check:all): remove byte-identical duplicate invoice rows
// created by racy re-scans, safely.
//
// Safety (per operator instruction):
//   1. Full pg_dump of the invoices table BEFORE any change.
//   2. JSON backup of every row in every duplicate group.
//   3. Delete ONLY rows that are identical to a kept sibling in EVERY material
//      field (amounts, date, currency, description, payment_method, category,
//      file_name, source) — i.e. zero information loss. The earliest row in each
//      identical set is kept. Groups whose rows DIFFER (invoice vs receipt,
//      manual edits) are left untouched and reported for manual UI resolution.
//
// Run:  node scripts/dedup-cleanup.mjs           (dry-run, reports only)
//       node scripts/dedup-cleanup.mjs --apply   (takes backups + deletes)
import { loadEnv, psql, scalar } from './_lib.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { repoRoot } from './_lib.mjs'

loadEnv()
const APPLY = process.argv.includes('--apply')
const url = process.env.DIRECT_URL
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

const SIG = `md5(
  coalesce(total::text,'')||'|'||coalesce(pretax::text,'')||'|'||coalesce(vat::text,'')||'|'||
  coalesce(date,'')||'|'||coalesce(currency,'')||'|'||coalesce(description,'')||'|'||
  coalesce(payment_method,'')||'|'||coalesce(category,'')||'|'||coalesce(file_name,'')||'|'||
  coalesce(source,''))`

// IDs to delete: within each (vendor, doc_number, signature) keep the earliest,
// mark the rest for deletion. Only exact-identical siblings qualify.
const DELETE_IDS_SQL = `
  with s as (
    select id, vendor, doc_number, created_at, ${SIG} as sig
    from public.invoices where coalesce(doc_number,'') <> ''
  ),
  ranked as (
    select id, row_number() over (partition by vendor, doc_number, sig
                                  order by created_at asc, id asc) rn
    from s
  )
  select id from ranked where rn > 1`

console.log(`\n=== dedup-cleanup ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===`)

// Report every duplicate group
const groupsJson = psql(`
  select coalesce(json_agg(row_to_json(g)), '[]') from (
    select vendor, doc_number, count(*) rows,
           count(distinct ${SIG}) variants,
           array_agg(total order by created_at) totals,
           array_agg(coalesce(date,'?') order by created_at) dates,
           array_agg(source order by created_at) sources,
           array_agg(coalesce(file_name,'?') order by created_at) files
    from public.invoices where coalesce(doc_number,'') <> ''
    group by vendor, doc_number having count(*) > 1
    order by vendor, doc_number
  ) g`)
const groups = JSON.parse(groupsJson)

const delIds = psql(DELETE_IDS_SQL).split('\n').map((s) => s.trim()).filter(Boolean)

console.log(`\nקבוצות כפולות: ${groups.length}`)
console.log(`רשומות זהות שיימחקו (exact re-scan): ${delIds.length}`)
console.log(`קבוצות עם וריאנטים (לא ייגעו, הכרעה ידנית): ${groups.filter((g) => g.variants > 1).length}\n`)

console.log('פירוט הקבוצות:')
for (const g of groups) {
  const kind = g.variants > 1 ? 'וריאנטים ⚠️' : 'זהות ✓'
  console.log(`  • ${g.vendor} / ${g.doc_number} — ${g.rows} שורות, ${g.variants} וריאנט(ים) [${kind}]`)
  console.log(`      totals=${JSON.stringify(g.totals)} sources=${JSON.stringify(g.sources)} files=${JSON.stringify(g.files)}`)
}

if (!APPLY) {
  console.log('\n(dry-run — לא בוצעו שינויים. הרץ עם --apply לגיבוי+מחיקה.)')
  process.exit(0)
}

// --- APPLY: backups first ---------------------------------------------------
const dir = join(repoRoot(), 'backups', `dedup-${stamp}`)
mkdirSync(dir, { recursive: true })

// (1) full table dump
execFileSync('pg_dump', [url, '-t', 'public.invoices', '-f', join(dir, 'invoices.dump.sql')])
console.log(`\n✓ גיבוי טבלה: ${join(dir, 'invoices.dump.sql')}`)

// (2) JSON of every row in every duplicate group
const rowsJson = psql(`
  select coalesce(json_agg(row_to_json(i)), '[]') from public.invoices i
  where (vendor, doc_number) in (
    select vendor, doc_number from public.invoices
    where coalesce(doc_number,'') <> ''
    group by vendor, doc_number having count(*) > 1
  )`)
writeFileSync(join(dir, 'duplicate-groups.json'), rowsJson)
console.log(`✓ גיבוי JSON: ${join(dir, 'duplicate-groups.json')} (${JSON.parse(rowsJson).length} שורות)`)

// (3) delete exact-duplicate rows
if (delIds.length === 0) {
  console.log('\nאין רשומות זהות למחיקה.')
  process.exit(0)
}
const before = scalar('select count(*) from public.invoices')
const idList = delIds.map((id) => `'${id}'`).join(',')
psql(`delete from public.invoices where id in (${idList})`, { args: ['-c'] })
const after = scalar('select count(*) from public.invoices')
console.log(`\n✓ נמחקו ${Number(before) - Number(after)} רשומות זהות (${before} → ${after}).`)
console.log('  הקבוצות עם וריאנטים נשארו — ראה TESTING.md להכרעה ידנית.')
