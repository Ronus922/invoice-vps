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
//   8. one definition of "the same document" (src/lib/doc-identity.ts) at every road into the table;
//   9. the owner's decisions of 2026-11-10 stay wired in: a tax invoice upgrades a stored receipt (docs/document-identity.md),
//      the folder scan deletes a duplicate's source file only after the existing row is confirmed, the issuer's tax id
//      is read by the base extraction, and a credit note is made negative BEFORE the VAT fallback.
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

  // 8 — one definition of "the same document" (src/lib/doc-identity.ts) at every road into the table
  const gmail = read('src/app/api/scan-gmail/route.ts')
  need(/\bfindDuplicateDocument\(supabase,/.test(gmail) && /\bownSendReason\(/.test(gmail), 'Gmail: זהות מסמך + דילוג על מיילי שליחה עצמית',
    'scan-gmail חייב להשתמש ב-findDuplicateDocument וב-ownSendReason (אחרת מיילי השליחה לרו"ח נקראים חזרה כחשבוניות חדשות)')
  need(/\bfindDuplicateDocument\(supabase, payload\)/.test(invoices), 'POST /api/invoices: זהות מסמך', 'POST /api/invoices חייב לבדוק זהות מסמך (findDuplicateDocument) לפני ההכנסה')
  need(/\bfindDuplicateDocument\(db,/.test(store), 'store.ts: זהות מסמך', 'store.ts חייב לחפש כפילות לפי זהות המסמך (findDuplicateDocument)')
  need(/\bfindDuplicateInList\(/.test(zone) && /\bfindDuplicateInList\(/.test(read('src/lib/folder-watch.ts')), 'אזור ההעלאה וסריקת התיקייה: findDuplicateInList',
    'UploadZone ו-folder-watch חייבים להשתמש ב-findDuplicateInList ולא בהשוואת ספק/סוג משלהם')
  need(/OWN_SEND_HEADER/.test(read('src/lib/accountant-send.ts')), 'מייל הרו"ח נושא כותרת סימון', 'accountant-send חייב להוסיף את OWN_SEND_HEADER')

  // 9 — the decisions of 2026-11-10
  const before = (src, a, b) => src.indexOf(a) !== -1 && src.indexOf(b) !== -1 && src.indexOf(a) < src.indexOf(b)
  const folder = read('src/lib/folder-watch.ts')
  const extractRoute = read('src/app/api/extract-invoice/route.ts')
  const invoiceWrite = read('src/lib/invoice-write.ts')
  const prompt = read('src/lib/invoice-extraction-prompt.ts')

  // Decision 1 — a tax invoice over a stored receipt upgrades that row, on every road that can meet it
  need(/\bduplicateAction\(/.test(gmail) && /\bupgradeReceiptToTaxInvoice\(/.test(gmail) && /\bduplicateAction\(/.test(invoices) && /\bupgradeReceiptToTaxInvoice\(/.test(invoices),
    'Gmail ו-POST /api/invoices: שדרוג קבלה לחשבונית מס (duplicateAction + upgradeReceiptToTaxInvoice)',
    'scan-gmail ו-POST /api/invoices חייבים לשדרג קבלה קיימת כשנכנסת חשבונית מס על אותה עסקה — לא ליצור שורה שנייה ולא לדלג')
  need(/\bduplicateAction\(/.test(save) && /\bstore\.upgradeInvoice\(/.test(save), 'הסריקה מהטלפון: שדרוג קבלה לחשבונית מס', 'save.ts חייב לשדרג קבלה קיימת (duplicateAction + store.upgradeInvoice) כשהסריקה היא חשבונית מס')
  need(/\bduplicateAction\(/.test(zone) && /\bduplicateAction\(/.test(folder), 'אזור ההעלאה וסריקת התיקייה: חשבונית מס מעל קבלה לא נדלגת בצד הדפדפן',
    'UploadZone ו-folder-watch חייבים לשאול duplicateAction לפני שהם מדלגים על קובץ — אחרת חשבונית מס מעל קבלה לא תגיע לשרת לשדרוג')
  // (the first removal of the uploaded object after the duplicate lookup must come AFTER the upgrade attempt: after an
  // upgrade that object is the stored row's file)
  const afterLookup = gmail.slice(gmail.indexOf('findDuplicateDocument(supabase,'))
  need(afterLookup.indexOf('upgradeReceiptToTaxInvoice(') !== -1 && afterLookup.indexOf('upgradeReceiptToTaxInvoice(') < afterLookup.indexOf('removeUploadedObject()'),
    'Gmail: השדרוג לפני מחיקת הקובץ שהועלה', 'scan-gmail: הקובץ שהועלה נמחק לפני שנבדק השדרוג — אחרי שדרוג הוא קובץ השורה הקיימת')

  // Decision 2 — a duplicate's source file leaves the folder only after the existing row and its file are confirmed
  const calls = folder.split('removeSourceFile(dirHandle, name)').length - 1
  need(calls === 2 && before(folder, 'async function removeConfirmedDuplicate(', 'verifyExistingDocument(existingId)') && before(folder, 'verifyExistingDocument(existingId)', 'const removed = await removeSourceFile(dirHandle, name)'),
    'סריקת תיקייה: קובץ כפול נמחק רק דרך removeConfirmedDuplicate (אימות לפני מחיקה)',
    'folder-watch: כל מחיקת קובץ מקור של כפילות חייבת לעבור דרך removeConfirmedDuplicate (verifyExistingDocument לפני removeSourceFile)')
  need(/\bduplicate\b[\s\S]{0,200}removeConfirmedDuplicate\(dirHandle, name, created\.existing_id/.test(folder) && /removeConfirmedDuplicate\(dirHandle, name, match\.id/.test(folder),
    'סריקת תיקייה: שני מסלולי הכפילות (בדיקה מקדימה, תשובת שרת) מאמתים לפני מחיקה', 'folder-watch: גם כפילות מהבדיקה המקדימה וגם כפילות שהשרת דיווח עליה חייבות לעבור אימות לפני מחיקת הקובץ')

  // Decision 4 — the issuer's tax id is read by the base extraction (so every path has it)
  need(/vendor_tax_id:\s*\{\s*type:\s*'string'\s*\}/.test(prompt.slice(0, prompt.indexOf('SCAN_CONFIDENCE_FIELDS'))), 'כלי החילוץ הבסיסי קורא vendor_tax_id', 'EXTRACTION_TOOL חייב לכלול vendor_tax_id — אחרת כלל ח.פ. חל רק על שורות מהסריקה מהטלפון')
  need(/vendor_tax_id/.test(invoices) && /normalizeTaxId\(/.test(gmail) && /normalizeTaxId\(/.test(extractRoute), 'ח.פ. נשמר ומנורמל בהעלאה, בתיקייה וב-Gmail', 'POST /api/invoices, extract-invoice ו-scan-gmail חייבים לשמור ולנרמל vendor_tax_id')

  // Decision 5 — a credit note is negative, before the VAT fallback derives from the total
  need(before(invoiceWrite, 'applyCreditNoteSign(payload)', 'deriveVatFromTotal({') && before(gmail, 'applyCreditNoteSign(extracted)', 'deriveVatFromTotal({') && before(extractRoute, 'applyCreditNoteSign(data)', 'deriveVatFromTotal({'),
    'זיכוי נהפך לשלילי לפני גזירת המע"מ (finalize, Gmail, extract-invoice)', 'applyCreditNoteSign חייב לרוץ לפני deriveVatFromTotal ב-finalizeInvoicePayload, ב-scan-gmail וב-extract-invoice')

  if (bad === 0) ok('סריקה נכנסת לאותו צינור, עם בדיקת הכפילות')
})
