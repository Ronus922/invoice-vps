#!/usr/bin/env node
// ONE-OFF: apply approved re-extraction corrections from a backups/reextract-*.json.
// Backs up the affected rows first, then updates ONLY pretax/vat/total/needs_review/
// validation_error. Never touches vendor/date/doc_number/file.
//   node scripts/apply-reextract.mjs backups/reextract-<stamp>.json
import { loadEnv, psql, repoRoot } from './_lib.mjs'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

loadEnv()
let file = process.argv[2]
if (!file) {
  const latest = readdirSync(join(repoRoot(), 'backups'))
    .filter((f) => f.startsWith('reextract-') && f.endsWith('.json')).sort().pop()
  if (!latest) { console.error('אין קובץ reextract-*.json'); process.exit(1) }
  file = join(repoRoot(), 'backups', latest)
}
const results = JSON.parse(readFileSync(file, 'utf8')).filter((r) => r.new && !r.error)
const ids = results.map((r) => `'${r.id}'`).join(',')

// Backup current state of exactly these rows.
const before = psql(`select coalesce(json_agg(row_to_json(i)),'[]') from public.invoices i where id in (${ids})`)
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const bak = join(repoRoot(), 'backups', `pre-correction-${stamp}.json`)
writeFileSync(bak, before)
console.log(`✓ גיבוי לפני עדכון: ${bak}`)

const numOrNull = (x) => (x == null || x === '' ? 'null' : Number(x))
let corrected = 0, flagged = 0
for (const r of results) {
  const n = r.new
  const needsReview = !r.new_balanced
  const verr = needsReview
    ? `'חילוץ מחדש — נדרשת בדיקה ידנית (אי-התאמה/זיכוי)'`
    : 'null'
  psql(
    `update public.invoices set
       pretax=${numOrNull(n.pretax)}, vat=${numOrNull(n.vat)}, total=${numOrNull(n.total)},
       needs_review=${needsReview}, validation_error=${verr},
       updated_at=now()
     where id='${r.id}'`,
    { args: ['-c'] }
  )
  if (needsReview) flagged++; else corrected++
  console.log(`  ${r.new_balanced ? '✓ תוקן ' : '⚠ סומן '} ${r.vendor}/${r.doc_number} → ${n.pretax}+${n.vat}=${n.total}`)
}
console.log(`\n✓ תוקנו ${corrected}, סומנו needs_review ${flagged}.`)
