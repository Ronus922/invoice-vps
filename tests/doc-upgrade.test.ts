import { describe, expect, it } from 'vitest'
import { duplicateAction, isTaxInvoiceType } from '@/lib/doc-upgrade'

// Decision 1 (2026-11-10): invoice + receipt of one transaction are ONE document. A tax invoice arriving over a
// stored receipt upgrades that row; a receipt arriving over a tax invoice — or any other repeat — is a duplicate.

describe('duplicateAction — what a same-document hit means', () => {
  it('a tax invoice over a stored receipt upgrades the row', () => {
    expect(duplicateAction('receipt', 'invoice')).toBe('upgrade')
  })

  it('a tax invoice/receipt over a stored receipt upgrades the row too', () => {
    expect(duplicateAction('receipt', 'invoice_receipt')).toBe('upgrade')
  })

  it('a receipt over a stored tax invoice is a duplicate', () => {
    expect(duplicateAction('invoice', 'receipt')).toBe('skip')
    expect(duplicateAction('invoice_receipt', 'receipt')).toBe('skip')
  })

  it('the same type twice is a duplicate', () => {
    for (const t of ['invoice', 'receipt', 'invoice_receipt', 'credit_note', 'unknown'] as const) {
      expect(duplicateAction(t, t), t).toBe('skip')
    }
  })

  it('only a RECEIPT is ever replaced: unknown / invoice / credit rows are never upgraded', () => {
    for (const stored of ['unknown', 'invoice', 'invoice_receipt', 'credit_note', 'other'] as const) {
      expect(duplicateAction(stored, 'invoice'), stored).toBe('skip')
      expect(duplicateAction(stored, 'invoice_receipt'), stored).toBe('skip')
    }
  })

  it('a stored receipt is not upgraded by something that is not a tax invoice', () => {
    for (const incoming of ['unknown', 'credit_note', 'other', 'receipt', null, undefined, '']) {
      expect(duplicateAction('receipt', incoming), String(incoming)).toBe('skip')
    }
  })

  it('reads printed titles like the rest of the app does (Hebrew and English)', () => {
    expect(duplicateAction('קבלה', 'חשבונית מס')).toBe('upgrade')
    expect(duplicateAction('Receipt', 'Tax Invoice')).toBe('upgrade')
    expect(duplicateAction('חשבונית מס', 'קבלה')).toBe('skip')
  })

  it('isTaxInvoiceType: invoice and invoice_receipt only', () => {
    expect(isTaxInvoiceType('invoice')).toBe(true)
    expect(isTaxInvoiceType('invoice_receipt')).toBe(true)
    expect(isTaxInvoiceType('receipt')).toBe(false)
    expect(isTaxInvoiceType('credit_note')).toBe(false)
    expect(isTaxInvoiceType(undefined)).toBe(false)
  })
})
