import { describe, expect, it } from 'vitest'
import { CSV_HEADERS, csvRowFor, csvSafe, totalsByCurrency, zipEntries } from '@/lib/export-rows'
import { formatCurrency } from '@/lib/format'

// Decision 5: credit notes are negative. The Excel export, the print totals and the ZIP must show them right: the
// minus survives into every amount cell, a credit REDUCES a currency's total, and its file is in the ZIP.

const inv = (over: Record<string, unknown> = {}) =>
  ({
    date: '10/06/2026', vendor: 'ריקונספט צימר באהבה', doc_number: '58857', doc_type: 'credit_note', description: 'חשבונית זיכוי', currency: 'ILS',
    pretax: -1400, vat: -252, total: -1652, payment_method: null, category: 'שיווק', file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/c.pdf', file_name: 'Reconcept refund 58857.pdf', ...over,
  }) as Parameters<typeof csvRowFor>[0]

describe('Excel / CSV rows', () => {
  it('a credit note keeps its minus on pre-tax, VAT and total — as raw numbers, not text', () => {
    const row = csvRowFor(inv())
    expect(row[5]).toBe(-1400)
    expect(row[6]).toBe(-252)
    expect(row[7]).toBe(-1652)
    expect(typeof row[7]).toBe('number')
  })

  it('has one cell per header', () => {
    expect(csvRowFor(inv())).toHaveLength(CSV_HEADERS.length)
  })

  it('text cells that start like a formula are neutralised; amount cells are not touched', () => {
    expect(csvSafe('=1+1')).toBe("'=1+1")
    expect(csvSafe('-5 ₪ זיכוי')).toBe("'-5 ₪ זיכוי")
    const row = csvRowFor(inv({ vendor: '=HYPERLINK("x")', total: -1 }))
    expect(row[1]).toBe(`'=HYPERLINK("x")`)
    expect(row[7]).toBe(-1)
  })

  it('a missing amount is an empty cell, a zero VAT stays 0', () => {
    const row = csvRowFor(inv({ pretax: null, vat: 0 }))
    expect(row[5]).toBe('')
    expect(row[6]).toBe(0)
  })
})

describe('print totals per currency', () => {
  it('a credit note REDUCES the currency total (1,652 invoice + 1,652 credit = 0)', () => {
    const totals = totalsByCurrency([inv({ doc_type: 'invoice', total: 1652 }), inv()])
    expect(totals.get('ILS')).toBe(0)
  })

  it('sums each currency on its own, signed', () => {
    const totals = totalsByCurrency([inv({ total: -55.52 }), inv({ doc_type: 'invoice', total: 118 }), inv({ currency: 'USD', doc_type: 'invoice', total: 100 }), inv({ currency: 'usd', total: -25.1 })])
    expect(totals.get('ILS')).toBeCloseTo(62.48, 2)
    expect(totals.get('USD')).toBeCloseTo(74.9, 2)
    expect([...totals.keys()].sort()).toEqual(['ILS', 'USD'])
  })

  it('shows a negative total with the minus (the formatter keeps it in front of the symbol)', () => {
    expect(formatCurrency(totalsByCurrency([inv()]).get('ILS')!, 'ILS')).toContain('-')
    expect(formatCurrency(totalsByCurrency([inv()]).get('ILS')!, 'ILS')).toContain('1,652.00')
  })

  it('a row with no currency counts as ILS; a missing total counts as 0', () => {
    const totals = totalsByCurrency([inv({ currency: '', total: -10 }), inv({ currency: null, total: null })])
    expect(totals.get('ILS')).toBe(-10)
  })
})

describe('ZIP entries', () => {
  it('a credit note\'s file is in the ZIP like any other', () => {
    expect(zipEntries([inv()])).toEqual([{ fileUrl: 'https://x/storage/v1/object/public/invoice-files/invoices/c.pdf', name: 'Reconcept refund 58857.pdf' }])
  })

  it('rows without a file are left out', () => {
    expect(zipEntries([inv({ file_url: null }), inv()])).toHaveLength(1)
  })

  it('without a file name the doc type keeps an invoice and a receipt of one number apart', () => {
    const [a, b] = zipEntries([inv({ file_name: null, doc_type: 'invoice' }), inv({ file_name: null, doc_type: 'receipt' })])
    expect(a!.name).not.toBe(b!.name)
    expect(zipEntries([inv({ file_name: null, doc_type: 'unknown' })])[0]!.name).toBe('ריקונספט צימר באהבה_58857.pdf')
  })
})
