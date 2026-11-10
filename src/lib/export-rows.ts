// What the export toolbar writes: the Excel/CSV rows, the print totals and the ZIP entries (moved out of
// ExportToolbar.tsx unchanged, so they can be tested). A credit note is stored with NEGATIVE amounts
// (src/lib/credit-note.ts): the export keeps the minus on every amount cell and in every per-currency total,
// so a credit reduces the total instead of adding to it.
import type { Invoice } from './entities'

type ExportInvoice = Pick<Invoice, 'date' | 'vendor' | 'doc_number' | 'doc_type' | 'description' | 'currency' | 'pretax' | 'vat' | 'total' | 'payment_method' | 'category' | 'file_url' | 'file_name'>

export const CSV_HEADERS = ['תאריך', 'ספק', "מס' חשבונית", 'תיאור', 'מטבע', 'לפני מע"מ', 'מע"מ', 'סה"כ', 'תשלום', 'קטגוריה'] as const

// Excel/Sheets execute cells starting with = + - @ (formula injection). Text
// fields only — numeric cells must stay raw so negative credit notes parse.
export const csvSafe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)

export function csvRowFor(inv: ExportInvoice): (string | number)[] {
  return [
    csvSafe(inv.date || ''),
    csvSafe(inv.vendor || ''),
    csvSafe(inv.doc_number || ''),
    csvSafe(inv.description || ''),
    csvSafe(inv.currency || 'ILS'),
    inv.pretax ?? '',
    inv.vat ?? '',
    inv.total ?? '',
    csvSafe(inv.payment_method || ''),
    csvSafe(inv.category || ''),
  ]
}

/** The signed sum of the totals, per currency code. */
export function totalsByCurrency(invoices: readonly Pick<Invoice, 'currency' | 'total'>[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const inv of invoices) {
    const code = (inv.currency || 'ILS').toUpperCase()
    totals.set(code, (totals.get(code) ?? 0) + (inv.total || 0))
  }
  return totals
}

/** One ZIP entry per row that has a file. The doc_type goes into the fallback name so an Invoice and a Receipt sharing a
 *  number don't collide as identical entries when file_name is absent. */
export function zipEntries(invoices: readonly ExportInvoice[]): { fileUrl: string; name: string }[] {
  return invoices
    .filter((inv) => inv.file_url)
    .map((inv) => ({
      fileUrl: inv.file_url!,
      name: inv.file_name || `${inv.vendor}_${inv.doc_number}${inv.doc_type && inv.doc_type !== 'unknown' ? `_${inv.doc_type}` : ''}.pdf`,
    }))
}
