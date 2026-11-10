// What to do when a NEW document turns out to be the same document as an existing row (src/lib/doc-identity.ts).
//
// Ronen's decision of 2026-11-10: an invoice and its receipt are ONE transaction. The tax invoice is the document
// the books need, so:
//   - a tax invoice (חשבונית מס, or חשבונית מס/קבלה) that arrives while the row holds only a RECEIPT replaces
//     that row's file and doc_type — no second row ("upgrade");
//   - a receipt that arrives after a tax invoice — or any other repeat — is a plain duplicate ("skip").
// Pure and shared with the browser: the folder scan and the upload zone ask it before they decide to skip a file.
import { normalizeDocType, type DocType } from './doc-type'

export type DuplicateAction = 'skip' | 'upgrade'

const TAX_INVOICE_TYPES: readonly DocType[] = ['invoice', 'invoice_receipt']

export function isTaxInvoiceType(docType: unknown): boolean {
  return (TAX_INVOICE_TYPES as readonly string[]).includes(normalizeDocType(docType))
}

/** `existing` is the doc_type of the row already stored, `incoming` the type of the document being added. */
export function duplicateAction(existing: unknown, incoming: unknown): DuplicateAction {
  return normalizeDocType(existing) === 'receipt' && isTaxInvoiceType(incoming) ? 'upgrade' : 'skip'
}
