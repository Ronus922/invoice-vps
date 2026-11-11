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
//  10. the owner's decisions of 2026-11-11 stay wired in: an upgraded receipt clears its sent / Drive markers and the tax
//      invoice is really sent (upgradeAndSend, on every road), a tax id known on both sides must match, a file that was
//      uploaded and got no row is removed again, and an unconfirmed folder duplicate is remembered by its hash and skipped
//      BEFORE the upload.
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
  need(/\bduplicateAction\(/.test(gmail) && /\bupgradeAndSend\(/.test(gmail) && /\bduplicateAction\(/.test(invoices) && /\bupgradeAndSend\(/.test(invoices),
    'Gmail ו-POST /api/invoices: שדרוג קבלה לחשבונית מס (duplicateAction + upgradeAndSend)',
    'scan-gmail ו-POST /api/invoices חייבים לשדרג קבלה קיימת כשנכנסת חשבונית מס על אותה עסקה — לא ליצור שורה שנייה ולא לדלג')
  need(/\bduplicateAction\(/.test(save) && /\bstore\.upgradeInvoice\(/.test(save), 'הסריקה מהטלפון: שדרוג קבלה לחשבונית מס', 'save.ts חייב לשדרג קבלה קיימת (duplicateAction + store.upgradeInvoice) כשהסריקה היא חשבונית מס')
  need(/\bduplicateAction\(/.test(zone) && /\bduplicateAction\(/.test(folder), 'אזור ההעלאה וסריקת התיקייה: חשבונית מס מעל קבלה לא נדלגת בצד הדפדפן',
    'UploadZone ו-folder-watch חייבים לשאול duplicateAction לפני שהם מדלגים על קובץ — אחרת חשבונית מס מעל קבלה לא תגיע לשרת לשדרוג')
  // (the first removal of the uploaded object after the duplicate lookup must come AFTER the upgrade attempt: after an
  // upgrade that object is the stored row's file)
  const afterLookup = gmail.slice(gmail.indexOf('findDuplicateDocument(supabase,'))
  need(afterLookup.indexOf('upgradeAndSend(') !== -1 && afterLookup.indexOf('upgradeAndSend(') < afterLookup.indexOf('removeUploadedObject()'),
    'Gmail: השדרוג לפני מחיקת הקובץ שהועלה', 'scan-gmail: הקובץ שהועלה נמחק לפני שנבדק השדרוג — אחרי שדרוג הוא קובץ השורה הקיימת')

  // (after a successful upgrade — and after a database error that leaves the outcome unknown — the uploaded object may be the
  // row's file: rowCreated = true keeps the catch below from removing it)
  const upgradeBlock = afterLookup.slice(afterLookup.indexOf('upgradeAndSend('), afterLookup.indexOf('removeUploadedObject()'))
  need((upgradeBlock.match(/rowCreated = true/g) ?? []).length === 2 && /reason === 'db_error'[\s\S]{0,800}status: 'error'/.test(upgradeBlock),
    'Gmail: אחרי שדרוג (או כשל DB לא חד-משמעי) האובייקט שהועלה נשמר',
    'scan-gmail: שדרוג שהצליח, וכשל DB בשדרוג, חייבים לסמן rowCreated = true (האובייקט עשוי להיות קובץ השורה) ולהחזיר error ולא duplicate')

  // the send for a NEW row happens inside the per-document lock (before the job returns), never after it: an upgrade of the
  // same document waits on that lock, so the two sends cannot interleave and overwrite each other's "sent" marker
  const lockJobEnd = gmail.indexOf("return { insertedId: inserted.id, insertPayload }")
  need(lockJobEnd !== -1 && gmail.lastIndexOf('await sendInvoiceToAccountant(', lockJobEnd) > gmail.indexOf('await withKeyLock(') && (gmail.match(/await sendInvoiceToAccountant\(/g) ?? []).length === 1,
    'Gmail: השליחה לרו"ח של שורה חדשה בתוך נעילת המסמך', 'scan-gmail חייב לשלוח את שורה חדשה לרו"ח בתוך withKeyLock — אחרת שדרוג של אותו מסמך יכול להשתלב איתה ולדרוס את סימון השליחה')

  // the phone-scan screen: after an upgrade the SERVER sent the tax invoice (upgradeAndSend) — the screen shows "sent" only
  // from the server's `sent` flag, and does not call /api/send-to-accountant itself for an upgrade
  const scanStep = read('src/components/scan/ScanStep.tsx')
  need(/data\.upgraded === true/.test(scanStep) && /if \(upgraded\) \{[\s\S]{0,400}sent = data\.sent === true/.test(scanStep) && /\} else if \(!needsReview\) \{/.test(scanStep),
    'מסך הסריקה מהטלפון: אחרי שדרוג "נשלח" מוצג רק לפי מה שהשרת דיווח', 'ScanStep חייב להציג "נשלח" אחרי שדרוג רק לפי data.sent === true של השרת, ולא לקרוא בעצמו ל-/api/send-to-accountant בשדרוג')

  // Decision 2 — a duplicate's source file leaves the folder only after the existing row and its file are confirmed
  const calls = folder.split('removeSourceFile(dirHandle, name)').length - 1
  // (two removals only: a confirmed duplicate, and a file that became a row — a REMEMBERED file is never deleted on an old match)
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

  // 10 — the decisions of 2026-11-11
  const upgradeReceipt = read('src/lib/upgrade-receipt.ts')
  const upgradeSend = read('src/lib/upgrade-send.ts')
  const scanStore = read('src/lib/scan/store.ts')
  const migrationPath = 'supabase/migrations/20261111_add_folder_duplicate_hashes.sql'
  const migration = existsSync(join(root, migrationPath)) ? read(migrationPath) : ''

  // an upgrade clears the markers that said "the receipt was sent / backed up" — including drive_file_id, which the backup
  // job reads as "already uploaded" — and the tax invoice is really sent, by the one helper every road uses
  need(['sent_to_accountant_at: null', 'accountant_send_error: null', 'backed_up_to_drive_at: null', 'drive_file_id: null', 'drive_backup_error: null'].every((s) => upgradeReceipt.includes(s)),
    'שדרוג קבלה: מאפס את סימוני השליחה לרו"ח והגיבוי ל-Drive (כולל drive_file_id)', 'upgrade-receipt חייב לאפס sent_to_accountant_at, accountant_send_error, backed_up_to_drive_at, drive_file_id ו-drive_backup_error — אחרת חשבונית המס לא תישלח ולא תגובה')
  need(/\bsendInvoiceToAccountant\(|\.sendInvoiceToAccountant\(input\)/.test(upgradeSend) && /\bupgradeReceiptToTaxInvoice\(/.test(upgradeSend) && /\bupgradeAndSend\(/.test(scanStore),
    'שדרוג קבלה: חשבונית המס נשלחת לרו"ח דרך upgradeAndSend (Gmail, העלאה/תיקייה, סריקה מהטלפון)', 'upgrade-send חייב לשלוח את חשבונית המס אחרי השדרוג, וכל המסלולים (כולל store של הסריקה) חייבים לעבור דרכו')
  need(![gmail, invoices, scanStore, save].some((s) => /\bupgradeReceiptToTaxInvoice\(/.test(s)), 'אף מסלול לא קורא ל-upgradeReceiptToTaxInvoice ישירות (רק דרך upgradeAndSend)', 'מסלול שמשדרג בלי upgradeAndSend לא שולח את חשבונית המס לרו"ח')
  // a tax id known on both sides must be the same, or nothing is upgraded
  need(/tax_id_mismatch/.test(upgradeReceipt) && /normalizeTaxId\(incoming\.vendor_tax_id\)/.test(upgradeReceipt) && /vendor_tax_id: extracted\.vendor_tax_id/.test(gmail.slice(gmail.indexOf('upgradeAndSend('))) && /vendor_tax_id: \(payload\.vendor_tax_id/.test(invoices) && /vendorTaxId: data\.vendor_tax_id/.test(save),
    'שדרוג קבלה: ח.פ. ידוע בשני הצדדים חייב להיות זהה', 'upgrade-receipt חייב לסרב (tax_id_mismatch) כשיש ח.פ. בשני הצדדים והם שונים, וכל מסלול חייב להעביר את ה-ח.פ. שקרא')

  // a file uploaded to Storage that got no row is removed again — on the server's "no row" answers, never on an upgrade or an unknown outcome
  const dbErrorBlock = invoices.slice(invoices.indexOf("upgrade.reason === 'db_error'"), invoices.indexOf("upgrade.reason === 'db_error'") + 400)
  need((invoices.match(/discardUnreferencedUpload\(/g) ?? []).length === 4 && !/discardUnreferencedUpload\(/.test(dbErrorBlock.slice(0, dbErrorBlock.indexOf('return NextResponse'))),
    'POST /api/invoices: קובץ שהועלה ולא נוצרה לו שורה נמחק (כפילות, שדרוג שלא יושם, כשל הכנסה) — לא בשדרוג ולא כשהתוצאה לא ידועה', 'POST /api/invoices חייב לקרוא ל-discardUnreferencedUpload בארבעת מסלולי "אין שורה" ולא בשדרוג מוצלח או בכשל DB לא חד-משמעי')
  need(/\bUPLOADED_OBJECT\b/.test(read('src/lib/discard-upload.ts')) && /select\('id'\)\.like\('file_url'/.test(read('src/lib/discard-upload.ts')) && /MAX_AGE_MS/.test(read('src/lib/discard-upload.ts')),
    'מחיקת קובץ שהועלה: רק אובייקט טרי בצורה המדויקת של העלאה, ורק אם אף שורה לא מצביעה עליו', 'discard-upload חייב להגביל לנתיב invoices/<uuid>.<סיומת>, לאובייקט שנוצר ב-6 השעות האחרונות, ולבדוק שאף שורת invoices לא מצביעה עליו')
  need((zone.match(/discardUploadedFile\(/g) ?? []).length >= 3 && (folder.match(/discardUploadedFile\(/g) ?? []).length >= 3,
    'אזור ההעלאה וסריקת התיקייה: קובץ שהועלה ולא נוצרה לו שורה נמחק', 'UploadZone ו-folder-watch חייבים להסיר את הקובץ שהועלה בכשל חילוץ, בכפילות שהדפדפן זיהה ובשגיאת שמירה')

  // a folder duplicate that could not be confirmed is remembered by its hash, and a remembered file is skipped BEFORE the upload
  need(before(folder, 'lookupKnownHash(hash)', 'await uploadFile(file)') && /checkExistingDocument\(known\.existing_id\)\) === 'unconfirmed'/.test(folder) && /if \(hash && existingId\) await rememberUnverifiedDuplicate\(/.test(folder.slice(folder.indexOf('async function removeConfirmedDuplicate('))),
    'סריקת תיקייה: כפילות לא מאומתת נזכרת לפי hash ומדולגת לפני ההעלאה והחילוץ', 'folder-watch חייב לבדוק lookupKnownHash לפני uploadFile ולדלג רק כשהשורה עדיין לא ניתנת לאימות, ו-removeConfirmedDuplicate חייב לזכור את ה-hash רק כשהשורה הכפולה נקובה בשמה')
  need(/ENABLE ROW LEVEL SECURITY/.test(migration) && /REVOKE ALL ON public\.folder_duplicate_hashes FROM anon, authenticated/.test(migration) && !/DROP |DELETE |TRUNCATE |ALTER TABLE (?!public\.folder_duplicate_hashes)/.test(migration.replace(/--.*$/gm, '')),
    'מיגרציית folder_duplicate_hashes: additive בלבד, RLS פעיל, בלי גישה ל-anon', `${migrationPath} חייב להיות additive (טבלה חדשה בלבד), עם RLS ו-REVOKE מ-anon`)

  if (bad === 0) ok('סריקה נכנסת לאותו צינור, עם בדיקת הכפילות')
})
