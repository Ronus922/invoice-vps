// Document type — the third dimension of invoice identity, alongside
// (vendor, doc_number). A vendor can issue more than one document under one
// number (Anthropic emits an Invoice AND a Receipt; Israeli practice has
// חשבונית מס / קבלה / חשבונית מס-קבלה / חשבונית זיכוי), so identity is
// (vendor, doc_number, doc_type). Mirrors the CHECK on public.invoices.doc_type.
export const DOC_TYPES = [
  'invoice',
  'receipt',
  'invoice_receipt',
  'credit_note',
  'other',
  'unknown',
] as const

export type DocType = (typeof DOC_TYPES)[number]

// Map a printed/free-text document type (Hebrew or English, from the AI or a
// user edit) to the canonical code. Unrecognized ⇒ 'unknown' — a SAFE default,
// since adding doc_type to the identity key only softens uniqueness.
export function normalizeDocType(input: unknown): DocType {
  if (typeof input !== 'string') return 'unknown'
  const s = input.trim().toLowerCase()
  if (!s) return 'unknown'
  if ((DOC_TYPES as readonly string[]).includes(s)) return s as DocType

  // Hebrew — order matters: credit + combined before the single types.
  if (s.includes('זיכוי')) return 'credit_note'
  if (s.includes('חשבונית') && s.includes('קבלה')) return 'invoice_receipt'
  if (s.includes('חשבונית')) return 'invoice' // חשבונית מס / חשבונית
  if (s.includes('קבלה')) return 'receipt'

  // English
  if (s.includes('credit')) return 'credit_note'
  if (s.includes('invoice') && s.includes('receipt')) return 'invoice_receipt'
  if (s.includes('invoice')) return 'invoice'
  if (s.includes('receipt')) return 'receipt'

  return 'unknown'
}

// Self-check (ponytail: branchy classifier keeps one runnable check).
// Runs only when executed directly (`npx tsx src/lib/doc-type.ts`); never in app.
if (import.meta.url === `file://${process.argv[1]}`) {
  const eq = (a: unknown, b: DocType) => {
    const got = normalizeDocType(a)
    if (got !== b) throw new Error(`doc-type: ${JSON.stringify(a)} → ${got} ≠ ${b}`)
  }
  eq('חשבונית מס', 'invoice')
  eq('קבלה', 'receipt')
  eq('חשבונית מס קבלה', 'invoice_receipt')
  eq('חשבונית זיכוי', 'credit_note')
  eq('Tax Invoice', 'invoice')
  eq('Receipt', 'receipt')
  eq('Credit Note', 'credit_note')
  eq('receipt', 'receipt') // already canonical
  eq('gibberish', 'unknown')
  eq(null, 'unknown')
  eq('', 'unknown')
  console.log('doc-type self-check ✓')
}
