import { normalizeCurrency } from '@/lib/format'
import { INVOICE_EXTRACTION_MODEL } from '@/lib/invoice-extraction-prompt'
import { validateInvoiceArithmetic } from '@/lib/invoice-validation'
import { finalizeInvoicePayload } from '@/lib/invoice-write'
import { normalizeDocType } from '@/lib/doc-type'
import { fromStoredDate, toStoredDate } from './format'
import { compressReceiptImage, ScanImageError, type CompressedImage } from './image'
import { receiptStoredName } from './downloadName'
import type { DuplicateInfo } from './model'
import type { ScanStore } from './store'
import type { ScanSaveData } from './validation'

// Saving a scanned receipt = the SAME road as any other document into the SAME table:
//   1. the identity (vendor, doc_number, doc_type) is looked up FIRST — a collision is handed back to
//      the screen, never dropped silently (and the photo is not even stored);
//   2. the photo (re-verified here: a client is never trusted to have compressed it) goes to the
//      private bucket;
//   3. the row is built and passed through finalizeInvoicePayload — the very function POST /api/invoices
//      uses (canonical doc_type, non-invoice gate, required-identity coercion, VAT fallback) — then
//      through validateInvoiceArithmetic, so a row that does not add up is needs_review and never
//      reaches the accountant;
//   4. the insert is guarded by the table's unique index; if it still collides (a race), the photo is
//      removed again and the collision is reported.
// The photo reaches Storage only here — an abandoned scan leaves nothing behind.

export type SaveResult =
  | { kind: 'saved'; invoice: Record<string, unknown> }
  | { kind: 'duplicate'; existing: DuplicateInfo | null }
  | { kind: 'bad_image'; error: ScanImageError }
  | { kind: 'failed'; stage: 'lookup' | 'upload' | 'insert' }

export interface SaveInput {
  data: ScanSaveData
  /** The bytes of the `image` field. */
  image: Buffer
  actorId: string
  /** Seam for tests; defaults to the real pipeline. */
  compress?: (input: Buffer) => Promise<CompressedImage>
  now?: () => Date
}

export async function saveScannedReceipt(store: ScanStore, input: SaveInput): Promise<SaveResult> {
  const { data, actorId } = input
  const docType = normalizeDocType(data.doc_type)

  // 1 — the identity, before any heavy work or any write.
  let existing: DuplicateInfo | null
  try {
    existing = await store.findDuplicate({ vendor: data.vendor, docNumber: data.doc_number, docType })
  } catch {
    return { kind: 'failed', stage: 'lookup' }
  }
  if (existing) return { kind: 'duplicate', existing }

  // 2 — the photo.
  let img: CompressedImage
  try {
    img = await (input.compress ?? compressReceiptImage)(input.image)
  } catch (err) {
    if (err instanceof ScanImageError) return { kind: 'bad_image', error: err }
    throw err
  }
  let stored: { path: string; fileUrl: string }
  try {
    stored = await store.uploadPhoto(img)
  } catch {
    return { kind: 'failed', stage: 'upload' }
  }

  // 3 — the row.
  const storedDate = toStoredDate(data.date)
  const payload: Record<string, unknown> = {
    doc_type: docType,
    vendor: data.vendor,
    vendor_tax_id: data.vendor_tax_id || null,
    doc_number: data.doc_number,
    date: storedDate,
    description: data.description || null,
    pretax: data.pretax,
    vat: data.vat,
    total: data.total ?? 0, // same as POST /api/invoices: a missing total still saves the file, flagged by the validator below
    currency: normalizeCurrency(data.currency),
    payment_method: data.payment_method || null,
    category: data.category || null,
    source: 'scan',
    file_url: stored.fileUrl,
    file_name: receiptStoredName({ vendor: data.vendor, docNumber: data.doc_number, docDate: fromStoredDate(storedDate), docType }),
    image_bytes: img.bytes.length,
    scanned_by: actorId,
    created_by: actorId,
    needs_review: false,
    validation_error: null,
  }
  // What the model read, when the form still carries its derivation; otherwise what Ronen typed.
  const original = data.ocr_read ?? { pretax: data.pretax, vat: data.vat }
  finalizeInvoicePayload(payload)

  const validation = validateInvoiceArithmetic({
    pretax: payload.pretax as number | null,
    vat: payload.vat as number | null,
    total: payload.total as number | null,
  })
  if (!validation.ok) {
    payload.needs_review = true
    if (!payload.validation_error) payload.validation_error = validation.reason
  }

  payload.extraction_raw = {
    model: INVOICE_EXTRACTION_MODEL,
    raw_text: '',
    parsed: data.ocr_fields ?? null,
    validation_error: payload.validation_error ?? null,
    scanned_at: (input.now ?? (() => new Date()))().toISOString(),
    source: 'scan',
    ocr_ok: data.ocr_ok,
    ...(payload.vat_derived ? { vat_derivation: { derived_at: (input.now ?? (() => new Date()))().toISOString(), original } } : {}),
  }

  // 4 — the insert.
  let result
  try {
    result = await store.insertInvoice(payload)
  } catch {
    await store.removePhoto(stored.path)
    return { kind: 'failed', stage: 'insert' }
  }
  if (!result.ok) {
    // The row is the record: without it the photo is an orphan nobody can reach.
    await store.removePhoto(stored.path)
    if (result.duplicate) {
      let again: DuplicateInfo | null = null
      try {
        again = await store.findDuplicate({ vendor: data.vendor, docNumber: data.doc_number, docType })
      } catch {
        /* the collision is reported either way */
      }
      return { kind: 'duplicate', existing: again }
    }
    return { kind: 'failed', stage: 'insert' }
  }
  return { kind: 'saved', invoice: result.row }
}
