import { SCAN_IMAGE_TARGET_BYTES } from '../scan/model'

// Retroactive compression of the files already in the `invoice-files` bucket — the PURE part: what a file is,
// whether it is worth replacing, and which files a trial run should look at. No I/O in this file, so every
// rule here is unit-tested (tests/compress-decision.test.ts) and shared by the dry run and --apply.

/** A file is replaced only when it gets MORE than this much lighter (Ronen's decision, 2026-11-09). */
export const MIN_SAVING_RATIO = 0.15
/** Photos aim for this weight — the same target the live scan pipeline uses. */
export const IMAGE_TARGET_BYTES = SCAN_IMAGE_TARGET_BYTES
/** A scanned PDF's page image is brought down to this resolution (never enlarged). */
export const PDF_SCAN_DPI = 150
/** The most pixels any decode may allocate (same cap the scan pipeline puts on an upload): a forged header
 *  claiming 120MP must not reach a decoder. */
export const MAX_INPUT_PIXELS = 50_000_000

export type FileKind = 'pdf' | 'jpeg' | 'png' | 'heic' | 'webp' | 'gif' | 'unknown'

/** What the bytes ARE, by magic number — never by the extension or the stored Content-Type
 *  (12 stored PDFs carry `application/octet-stream`). */
export function sniffKind(buf: Uint8Array): FileKind {
  const at = (i: number) => buf[i] ?? -1
  const ascii = (from: number, to: number) => String.fromCharCode(...Array.from(buf.subarray(from, to)))
  if (ascii(0, 5) === '%PDF-') return 'pdf'
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpeg'
  if (at(0) === 0x89 && ascii(1, 4) === 'PNG') return 'png'
  if (ascii(4, 8) === 'ftyp') return 'heic'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  if (ascii(0, 3) === 'GIF') return 'gif'
  return 'unknown'
}

export type PdfClass = 'pdf-signed' | 'pdf-text' | 'pdf-scanned-ocr' | 'pdf-scanned' | 'pdf-other'
export type ContentClass = PdfClass | 'jpeg' | 'png' | 'heic' | 'webp' | 'gif' | 'unknown'

export const CLASS_LABEL: Record<ContentClass, string> = {
  'pdf-signed': 'PDF חתום דיגיטלית',
  'pdf-text': 'PDF טקסטואלי',
  'pdf-scanned-ocr': 'PDF סרוק + שכבת טקסט (OCR)',
  'pdf-scanned': 'PDF סרוק (בלי טקסט)',
  'pdf-other': 'PDF אחר (בלי טקסט ובלי תמונות)',
  jpeg: 'JPG',
  png: 'PNG',
  heic: 'HEIC',
  webp: 'WEBP',
  gif: 'GIF',
  unknown: 'אחר / לא מזוהה',
}

export interface PdfFacts {
  pages: number
  /** Non-whitespace characters `pdftotext` finds in the whole file. */
  textChars: number
  /** Bytes of all image XObject streams as stored. */
  imageBytes: number
  imageCount: number
  fileBytes: number
}

/** Fewer extractable characters per page than this = no text layer worth the name. */
const MIN_TEXT_CHARS_PER_PAGE = 80
/** When images are at least this share of the file, the file is image-dominant (a scan). */
const IMAGE_DOMINANT_SHARE = 0.5

/** Text PDF vs scanned PDF. A page-sized photo with an invisible OCR layer has BOTH text and weight in images —
 *  it is image-dominant, so it is treated as a scan (its images are the thing to shrink), and the text layer
 *  is kept as it is either way. */
export function classifyPdf(f: PdfFacts): PdfClass {
  const hasText = f.pages > 0 && f.textChars / f.pages >= MIN_TEXT_CHARS_PER_PAGE
  const imageDominant = f.fileBytes > 0 && f.imageBytes / f.fileBytes >= IMAGE_DOMINANT_SHARE
  if (hasText) return imageDominant ? 'pdf-scanned-ocr' : 'pdf-text'
  return f.imageCount > 0 ? 'pdf-scanned' : 'pdf-other'
}

export function classOfKind(kind: FileKind): ContentClass {
  return kind === 'pdf' ? 'pdf-other' : kind
}

/** The ONLY classes this tool ever changes (Ronen, 2026-11-09): JPEG photos and scanned PDFs that carry no text.
 *  A whitelist, so a class added to the code later is untouched until someone adds it here on purpose. */
export const COMPRESSIBLE_CLASSES: readonly ContentClass[] = ['jpeg', 'pdf-scanned']

/** Why a class is out of scope; null when it may be compressed. Signed PDFs (a rewrite breaks the signature) and
 *  PDFs with a text layer — born-digital or OCR'd scans — are left exactly as they are. */
export function excludedReason(c: ContentClass): SkipReason | null {
  if (COMPRESSIBLE_CLASSES.includes(c)) return null
  if (c === 'pdf-signed') return 'signed-pdf'
  if (c === 'pdf-text' || c === 'pdf-scanned-ocr') return 'text-layer-pdf'
  return 'class-excluded'
}

export type SkipReason =
  | 'source-scan' // already compressed by the scan pipeline (≤300KB JPEG, no metadata)
  | 'signed-pdf' // never touched: rewriting the file would invalidate its digital signature
  | 'text-layer-pdf' // never touched: a PDF with a text layer (born-digital, or a scan with an OCR layer) is out of scope
  | 'class-excluded' // any other class not on the COMPRESSIBLE_CLASSES list (e.g. a PDF with neither text nor images)
  | 'encrypted-pdf'
  | 'pdfa-1' // PDF/A-1 forbids the compressed object streams a rewrite writes: the file would stop being what it claims to be
  | 'unsupported-type' // PNG / HEIC / WEBP / GIF / unknown: no row has one today, so no engine for them
  | 'object-missing' // the row points at an object the bucket does not hold
  | 'download-failed'
  | 'size-mismatch' // the downloaded bytes are not the size the bucket lists: not the object we think it is
  | 'apply-failed' // --apply only: the replacement was rolled back, or never attempted because the run stopped
  | 'within-target' // a photo already at or under the weight target is not re-encoded (no generation loss)
  | 'engine-failed'
  | 'integrity-failed'
  | 'not-smaller'
  | 'below-threshold'

export const SKIP_LABEL: Record<SkipReason, string> = {
  'source-scan': 'כבר נדחס ע"י הסריקה',
  'signed-pdf': 'PDF חתום דיגיטלית',
  'text-layer-pdf': 'PDF עם שכבת טקסט (מוחרג)',
  'class-excluded': 'סוג מחוץ לטווח הדחיסה',
  'encrypted-pdf': 'PDF מוצפן',
  'pdfa-1': 'PDF/A-1 (נשבר ע"י כתיבה מחדש)',
  'unsupported-type': 'סוג קובץ ללא מנוע',
  'object-missing': 'האובייקט לא נמצא בדלי',
  'download-failed': 'הורדה נכשלה',
  'size-mismatch': 'גודל ההורדה שונה מהרשימה',
  'apply-failed': 'ההחלפה נכשלה / לא בוצעה',
  'within-target': 'כבר עד 300KB',
  'engine-failed': 'המנוע נכשל',
  'integrity-failed': 'בדיקת שלמות נכשלה',
  'not-smaller': 'התוצר לא קטן יותר',
  'below-threshold': 'חיסכון קטן מ-15%',
}

export interface DecisionInput {
  source: string | null
  kind: FileKind
  contentClass: ContentClass
  beforeBytes: number
  /** Set when a rule decided before (or instead of) the engine: signed, encrypted, within target, … */
  preSkip: SkipReason | null
  /** The engine's output size; null when it produced nothing. */
  afterBytes: number | null
  /** null = the integrity check did not run (no output); otherwise its verdict. */
  integrityOk: boolean | null
}

export type Decision =
  | { action: 'replace'; savingBytes: number; savingPct: number }
  | { action: 'skip'; reason: SkipReason }

export const savingRatio = (before: number, after: number): number => (before > 0 ? (before - after) / before : 0)
export const savingPct = (before: number, after: number): number => savingRatio(before, after) * 100

/** The single place that says replace-or-skip. Order matters: a rule that forbids touching a file wins over any
 *  size arithmetic, and a file that fails its integrity check is never replaced however light it got. */
export function decide(i: DecisionInput): Decision {
  if (i.source === 'scan') return { action: 'skip', reason: 'source-scan' }
  if (i.kind !== 'pdf' && i.kind !== 'jpeg') return { action: 'skip', reason: 'unsupported-type' }
  if (i.preSkip) return { action: 'skip', reason: i.preSkip }
  const excluded = excludedReason(i.contentClass)
  if (excluded) return { action: 'skip', reason: excluded } // out-of-scope class: whatever the engine produced, it is not used
  if (i.afterBytes === null) return { action: 'skip', reason: 'engine-failed' }
  if (i.integrityOk !== true) return { action: 'skip', reason: 'integrity-failed' }
  if (i.afterBytes >= i.beforeBytes) return { action: 'skip', reason: 'not-smaller' }
  // "More than 15%": exactly 15.0% is not enough. Compared as a ratio, not as a percentage, so 0.15 is 0.15.
  if (savingRatio(i.beforeBytes, i.afterBytes) <= MIN_SAVING_RATIO) return { action: 'skip', reason: 'below-threshold' }
  return { action: 'replace', savingBytes: i.beforeBytes - i.afterBytes, savingPct: savingPct(i.beforeBytes, i.afterBytes) }
}

export interface Candidate {
  key: string
  kind: FileKind
  bytes: number
}

/** The `--limit N` sample: every kind gets a turn (largest first inside a kind), so a 20-file trial
 *  exercises the JPEG path AND the PDF path instead of 20 of whichever is biggest. Deterministic. */
export function pickSample<T extends Candidate>(items: readonly T[], limit: number): T[] {
  if (limit <= 0) return []
  const groups = new Map<FileKind, T[]>()
  for (const it of items) {
    const g = groups.get(it.kind) ?? []
    g.push(it)
    groups.set(it.kind, g)
  }
  const lists = [...groups.keys()]
    .sort()
    .map((k) => groups.get(k)!.slice().sort((a, b) => b.bytes - a.bytes || a.key.localeCompare(b.key)))
  const out: T[] = []
  for (let round = 0; out.length < limit && lists.some((l) => round < l.length); round++) {
    for (const l of lists) {
      const it = l[round]
      if (it && out.length < limit) out.push(it)
    }
  }
  return out
}

export interface ResultRow {
  contentClass: ContentClass
  beforeBytes: number
  decision: Decision
}

export interface ClassSummary {
  contentClass: ContentClass
  count: number
  before: number
  /** The bucket weight after applying every decision: replaced files at their new size, skipped files unchanged. */
  after: number
  replaced: number
  skipped: number
  skippedBy: Partial<Record<SkipReason, number>>
}

export function summarize(rows: readonly ResultRow[]): ClassSummary[] {
  const by = new Map<ContentClass, ClassSummary>()
  for (const r of rows) {
    const s = by.get(r.contentClass) ?? { contentClass: r.contentClass, count: 0, before: 0, after: 0, replaced: 0, skipped: 0, skippedBy: {} }
    s.count++
    s.before += r.beforeBytes
    if (r.decision.action === 'replace') {
      s.replaced++
      s.after += r.beforeBytes - r.decision.savingBytes
    } else {
      s.skipped++
      s.after += r.beforeBytes
      s.skippedBy[r.decision.reason] = (s.skippedBy[r.decision.reason] ?? 0) + 1
    }
    by.set(r.contentClass, s)
  }
  return [...by.values()].sort((a, b) => b.before - a.before)
}
