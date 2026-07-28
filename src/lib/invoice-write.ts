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
