// A credit note (חשבונית זיכוי) reduces what is owed, so it is stored with a NEGATIVE total, pre-tax and VAT
// (Ronen's decision, 2026-11-10). The document itself usually prints the amounts positive ("סה"כ 1,652.00"), and the
// extraction used to copy them as printed — a credit then ADDED to the totals and could not tell itself apart from the
// invoice it cancels. Applied wherever a row's amounts are fixed before they are stored: the extraction routes, the
// Gmail scan and finalizeInvoicePayload (POST /api/invoices and the phone scan).
//
// Idempotent: an amount that is already negative stays as it is, so a second pass (or a model that did return a
// negative number) never flips it back. Zero and missing amounts are left alone.
import { normalizeDocType } from './doc-type'

type Amount = number | string | null | undefined

function negate(value: Amount): number | null | undefined {
  if (value === null || value === undefined || value === '') return value as null | undefined
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''))
  if (!Number.isFinite(n) || n === 0) return typeof value === 'number' ? value : (value as unknown as number)
  return -Math.abs(n)
}

/** Mutates `fields` when its doc_type is a credit note; returns whether it changed anything's sign. */
export function applyCreditNoteSign(fields: { doc_type?: unknown; pretax?: unknown; vat?: unknown; total?: unknown }): boolean {
  if (normalizeDocType(fields.doc_type) !== 'credit_note') return false
  let changed = false
  for (const key of ['pretax', 'vat', 'total'] as const) {
    const before = fields[key] as Amount
    const after = negate(before)
    if (after !== before) {
      fields[key] = after
      changed = true
    }
  }
  return changed
}
