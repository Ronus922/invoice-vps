#!/usr/bin/env node
// INVARIANT: a scanned receipt takes the SAME road into the SAME table as every other document, and
//   that road includes the duplicate guard. Concretely (static — reads files only, no DB, no install):
//   1. the duplicate lookup runs BEFORE the photo is stored, and the photo is stored BEFORE the insert;
//   2. the row goes through finalizeInvoicePayload (the very function POST /api/invoices uses) and
//      validateInvoiceArithmetic, so a scan can never skip the non-invoice gate, the identity
//      coercion, the VAT fallback or the needs_review flag;
//   3. the table's unique-index hit (23505) is reported as a duplicate, never swallowed;
//   4. nothing under the scan routes / screen writes to `invoices` directly — the only insert lives in
//      src/lib/scan/store.ts, reached through saveScannedReceipt;
//   5. POST /api/invoices still uses the shared finalize step (so the two cannot drift apart);
//   6. the image route serves only rows with source = 'scan' (it must not become a generic file proxy);
//   7. the scan UI is ONLY the upload zone on the home page: no /scan page, no link or router.push to it,
//      and the zone splits PDFs (the old queue) from photos (the scan overlay).
// The behaviour behind each of these is proved with fakes in tests/scan-save.test.ts (pnpm test);
// this check is the cheap guard that runs in CI without node_modules.
import { run, repoRoot, fail, ok } from './_lib.mjs'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

run('check-scan-pipeline', async () => {
  const root = repoRoot()
  const read = (rel) => readFileSync(join(root, rel), 'utf8')
  let bad = 0
  const need = (cond, good, problem) => (cond ? ok(good) : (bad++, fail(problem)))

  // 1 + 2 — the order and the shared steps, in save.ts
  const save = read('src/lib/scan/save.ts')
  const at = (needle) => save.indexOf(needle)
  need(at('store.findDuplicate(') !== -1 && at('store.findDuplicate(') < at('store.uploadPhoto(') && at('store.uploadPhoto(') < at('store.insertInvoice('),
    'save.ts: findDuplicate → uploadPhoto → insertInvoice, in that order',
    'save.ts: הסדר חייב להיות findDuplicate ← uploadPhoto ← insertInvoice (בדיקת כפילות לפני כל כתיבה)')
  need(/\bfinalizeInvoicePayload\(payload\)/.test(save), 'save.ts: finalizeInvoicePayload', 'save.ts: חסר finalizeInvoicePayload — סריקה עוקפת את הנרמול המשותף')
  need(/\bvalidateInvoiceArithmetic\(/.test(save), 'save.ts: validateInvoiceArithmetic', 'save.ts: חסר validateInvoiceArithmetic — שורה לא מאוזנת לא תסומן needs_review')
  need(/source:\s*'scan'/.test(save), "save.ts: source = 'scan'", "save.ts: חסר source: 'scan'")

  // 3 — the unique index is a duplicate, not an error and not a silent skip
  const store = read('src/lib/scan/store.ts')
  need(/23505[\s\S]{0,80}duplicate:\s*true/.test(store), 'store.ts: 23505 → duplicate', 'store.ts: התנגשות באינדקס הייחודי (23505) חייבת לחזור כ-duplicate')

  // 4 — a single writer
  const writers = []
  for (const dir of ['src/app/api/scan', 'src/components/scan', 'src/lib/scan']) {
    for (const file of walk(join(root, dir))) {
      const text = readFileSync(file, 'utf8')
      if (/\.from\(\s*['"]invoices['"]\s*\)\s*\.(insert|upsert)\(/.test(text.replace(/\s+/g, ' ').replace(/\) \./g, ').'))) writers.push(relative(root, file))
    }
  }
  need(writers.length === 1 && writers[0] === 'src/lib/scan/store.ts', 'כתיבה ל-invoices רק מ-src/lib/scan/store.ts',
    'כתיבה ישירה ל-invoices מחוץ ל-store.ts: ' + (writers.join(', ') || '(אף אחד — store.ts עצמו לא כותב?)'))
  const saveRoute = read('src/app/api/scan/save/route.ts')
  need(/\bsaveScannedReceipt\(/.test(saveRoute), 'route /api/scan/save → saveScannedReceipt', 'route /api/scan/save חייב לעבור דרך saveScannedReceipt')

  // 5 — the shared step stays shared
  const invoices = read('src/app/api/invoices/route.ts')
  need(/\bfinalizeInvoicePayload\(payload\)/.test(invoices), 'POST /api/invoices משתמש ב-finalizeInvoicePayload', 'POST /api/invoices חייב להשתמש ב-finalizeInvoicePayload (אחרת הסריקה והעלאה ידנית ייפרדו)')

  // 6 — the image route is scoped to scanned rows
  const store2 = read('src/lib/scan/store.ts')
  need(/\.eq\(\s*['"]source['"]\s*,\s*['"]scan['"]\s*\)/.test(store2), "getScanRow מסנן source = 'scan'", "getScanRow חייב לסנן .eq('source', 'scan') — אחרת ה-route הופך ל-proxy כללי לקבצים")

  // 7 — one entry point: the upload zone on the home page
  need(!existsSync(join(root, 'src/app/scan')), 'אין עמוד /scan נפרד', 'src/app/scan חייב לא להתקיים — ה-UI היחיד לסריקה הוא אזור ההעלאה בדף הבית')
  const stray = []
  for (const file of walk(join(root, 'src'))) {
    if (file.startsWith(join(root, 'src/app/api'))) continue
    if (/(?:push|replace|prefetch)\(\s*['"`]\/scan\b|href=\{?\s*['"`]\/scan\b|redirect\(\s*['"`]\/scan\b/.test(readFileSync(file, 'utf8'))) stray.push(relative(root, file))
  }
  need(stray.length === 0, 'אין ניווט ל-/scan', 'ניווט ל-/scan (מסך שאינו קיים): ' + stray.join(', '))
  const zone = read('src/components/invoices/UploadZone.tsx')
  need(/\bsplitUploads\(/.test(zone) && /<ScanOverlay\b/.test(zone), 'UploadZone מפצל PDF / תמונה ופותח את ה-overlay של הסריקה',
    'UploadZone חייב לפצל קבצים (splitUploads) ולפתוח את ScanOverlay לתמונות — אחרת תמונה חוזרת לצינור הישיר בלי חיתוך')
  need(/accept="application\/pdf,image\/\*"/.test(zone), 'ה-input של אזור ההעלאה מקבל PDF ותמונות', 'ה-input של אזור ההעלאה חייב להיות accept="application/pdf,image/*"')

  if (bad === 0) ok('סריקה נכנסת לאותו צינור, עם בדיקת הכפילות')
})
