import { normalizeDocType, isNonInvoiceDocType, NON_INVOICE_REVIEW_MESSAGE } from '@/lib/doc-type'
import { applyCreditNoteSign } from '@/lib/credit-note'
import { deriveVatFromTotal } from '@/lib/vat-derivation'

// DB has NOT NULL on vendor/doc_number; AI sometimes returns null when it
// can't read those fields. Coerce to '' and force needs_review so the user
// can fix manually instead of losing the file. Shared by the manual write path
// (/api/invoices POST) and the Gmail scan insert.
export function coerceRequiredIdentityFields(payload: Record<string, unknown>): void {
  const vendorMissing = payload.vendor == null || String(payload.vendor).trim() === ''
  const docMissing = payload.doc_number == null || String(payload.doc_number).trim() === ''
  if (vendorMissing) payload.vendor = ''
  if (docMissing) payload.doc_number = ''
  if (vendorMissing || docMissing) {
    payload.needs_review = true
    if (!payload.validation_error) {
      payload.validation_error =
        vendorMissing && docMissing
          ? 'שם ספק ומספר מסמך חסרים'
          : vendorMissing
            ? 'שם ספק חסר'
            : 'מספר מסמך חסר'
    }
  }
}

// The write-time normalisation every manual-style invoice insert goes through: a canonical
// doc_type, the non-invoice review gate, the required-identity coercion and the VAT fallback.
// Shared by POST /api/invoices and the receipt-scan save so a scanned receipt can never take a
// different road into the table than an uploaded one. Mutates `payload`, like the helper above.
// (Moved verbatim out of POST /api/invoices — behaviour unchanged.)
export function finalizeInvoicePayload(payload: Record<string, unknown>): void {
  // Always store a canonical doc_type (the DB CHECK rejects anything else).
  payload.doc_type = normalizeDocType(payload.doc_type)

  // A credit note is stored with a NEGATIVE total, pre-tax and VAT (src/lib/credit-note.ts) — before the VAT
  // fallback below, which then derives from the signed total.
  applyCreditNoteSign(payload)

  // A positively-identified non-invoice (proforma / quote / delivery note)
  // must never reach the accountant automatically — force review.
  if (isNonInvoiceDocType(payload.doc_type)) {
    payload.needs_review = true
    payload.validation_error = NON_INVOICE_REVIEW_MESSAGE
  }

  coerceRequiredIdentityFields(payload)

  // VAT fallback: when extraction left pretax/vat empty (or unbalanced) but the
  // total is valid, derive them from the total instead of flagging the invoice.
  const derivation = deriveVatFromTotal({
    pretax: (payload.pretax as number | null | undefined) ?? null,
    vat: (payload.vat as number | null | undefined) ?? null,
    total: (payload.total as number | null | undefined) ?? null,
    currency: (payload.currency as string | null | undefined) ?? null,
    date: (payload.date as string | null | undefined) ?? null,
  })
  if (derivation.vatDerived) {
    payload.pretax = derivation.pretax
    payload.vat = derivation.vat
    payload.vat_derived = true
  }
}
