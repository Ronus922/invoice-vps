#!/usr/bin/env node
// ONE-OFF: derive pretax/vat from total for rows where VAT extraction failed.
// Covers two populations:
//   1. vat IS NULL AND pretax IS NULL AND total > 0 (never flagged, sent with
//      an empty VAT column)
//   2. needs_review=true rows whose ONLY problem is pretax+vat ≠ total — the
//      user decided to trust the printed total; these get unflagged so they
//      can be sent to the accountant.
// Mirrors src/lib/vat-derivation.ts (keep in sync). Backs up affected rows
// first. Run with --dry-run to preview.
//   node scripts/backfill-derive-vat.mjs [--dry-run]
import { loadEnv, psql, repoRoot } from './_lib.mjs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

loadEnv()
const dryRun = process.argv.includes('--dry-run')

// ── Mirror of src/lib/vat-derivation.ts ──────────────────────
const VAT_RATE_PERIODS = [
  { from: '2025-01-01', rate: 0.18 },
  { from: '2015-10-01', rate: 0.17 },
  { from: '1900-01-01', rate: 0.18 },
]
const round2 = (n) => Math.round(n * 100) / 100

function parseInvoiceDate(str) {
  if (!str) return null
  if (str.includes('/')) {
    const [d, m, y] = str.split('/')
    const date = new Date(`${y}-${m}-${d}`)
    return isNaN(date.getTime()) ? null : date
  }
  const date = new Date(str)
  return isNaN(date.getTime()) ? null : date
}

function israelVatRate(dateStr) {
  const date = parseInvoiceDate(dateStr)
  if (!date) return 0.18
  for (const p of VAT_RATE_PERIODS) {
    if (date.getTime() >= new Date(p.from).getTime()) return p.rate
  }
  return 0.18
}

function derive(row) {
  const total = Number(row.total)
  const currency = (row.currency || 'ILS').toUpperCase()
  if (currency !== 'ILS') return { pretax: total, vat: 0, rate: 0 }
  const rate = israelVatRate(row.date)
  const pretax = round2(total / (1 + rate))
  return { pretax, vat: round2(total - pretax), rate }
}
// ─────────────────────────────────────────────────────────────

const MISMATCH_ONLY = `(
  needs_review = true
  and total is not null and total > 0
  and pretax is not null and vat is not null
  and abs((pretax + vat) - total) > greatest(0.05, total * 0.005)
)`
const NULL_PAIR = `(vat is null and pretax is null and total is not null and total > 0 and needs_review = false)`

const rows = JSON.parse(
  psql(`select coalesce(json_agg(row_to_json(s)), '[]') from (
    select id, date, vendor, doc_number, currency, doc_type, pretax, vat, total,
           needs_review, validation_error
    from public.invoices
    where ${NULL_PAIR} or ${MISMATCH_ONLY}
    order by created_at
  ) s`)
)

if (rows.length === 0) {
  console.log('אין שורות לגזירת מע״מ — הכל מאוזן.')
  process.exit(0)
}

console.log(`נמצאו ${rows.length} שורות לגזירת מע״מ מהסה״כ:\n`)

let ils17 = 0, ils18 = 0, foreign = 0, unflagged = 0
const updates = []
for (const row of rows) {
  const wasMismatch = row.needs_review
  const d = derive(row)
  if (d.rate === 0) foreign++
  else if (d.rate === 0.17) ils17++
  else ils18++
  if (wasMismatch) unflagged++
  console.log(
    `  ${wasMismatch ? '⚠→✓' : '  ∅→'} ${row.vendor || '?'}/${row.doc_number || '?'} ` +
    `(${row.date || '?'}, ${row.currency}): ${row.pretax ?? '∅'}+${row.vat ?? '∅'} → ` +
    `${d.pretax}+${d.vat}=${row.total} (rate ${d.rate})`
  )
  updates.push({ row, d })
}

console.log(
  `\nסיכום: ${ils18} בשיעור 18%, ${ils17} בשיעור 17%, ${foreign} מט״ח (מע״מ 0), ` +
  `${unflagged} ישוחררו מ-needs_review.`
)

if (dryRun) {
  console.log('\n--dry-run: לא בוצעו שינויים.')
  process.exit(0)
}

// Backup exact current state of the affected rows.
const ids = rows.map((r) => `'${r.id}'`).join(',')
const before = psql(
  `select coalesce(json_agg(row_to_json(i)),'[]') from public.invoices i where id in (${ids})`
)
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const bak = join(repoRoot(), 'backups', `pre-vat-derive-${stamp}.json`)
writeFileSync(bak, before)
console.log(`\n✓ גיבוי לפני עדכון: ${bak}`)

let applied = 0
for (const { row, d } of updates) {
  // Guard re-checks the original condition so a row fixed meanwhile is skipped.
  const out = psql(
    `update public.invoices set
       pretax=${d.pretax}, vat=${d.vat}, vat_derived=true,
       needs_review=false, validation_error=null,
       extraction_raw = coalesce(extraction_raw,'{}'::jsonb) || jsonb_build_object(
         'vat_derivation', jsonb_build_object(
           'rate', ${d.rate}, 'derived_at', now(),
           'original', jsonb_build_object('pretax', ${row.pretax ?? 'null'}, 'vat', ${row.vat ?? 'null'})
         )),
       updated_at=now()
     where id='${row.id}' and ((vat is null and pretax is null) or needs_review = true)`,
    { args: ['-c'] }
  )
  if (out.includes('UPDATE 1')) applied++
}

console.log(`\n✓ עודכנו ${applied}/${updates.length} שורות. הרץ npm run check:money לאימות.`)
