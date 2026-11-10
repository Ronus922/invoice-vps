import { describe, it, expect } from 'vitest'
import { NON_INVOICE_REVIEW_MESSAGE } from '@/lib/doc-type'
import { finalizeInvoicePayload } from '@/lib/invoice-write'

// finalizeInvoicePayload was moved verbatim out of POST /api/invoices so the receipt scan takes the same
// road. These cases pin the behaviour that POST had before the move.

const fin = (payload: Record<string, unknown>) => {
  finalizeInvoicePayload(payload)
  return payload
}

describe('finalizeInvoicePayload (the shared write-time normalisation)', () => {
  it('stores a canonical doc_type, mapping Hebrew labels and falling back to unknown', () => {
    expect(fin({ vendor: 'A', doc_number: '1', total: 10, doc_type: 'חשבונית מס קבלה' }).doc_type).toBe('invoice_receipt')
    expect(fin({ vendor: 'A', doc_number: '1', total: 10, doc_type: 'gibberish' }).doc_type).toBe('unknown')
    expect(fin({ vendor: 'A', doc_number: '1', total: 10 }).doc_type).toBe('unknown')
  })

  it('holds a positively-identified non-invoice for review with the standard message', () => {
    expect(fin({ vendor: 'A', doc_number: '1', total: 10, doc_type: 'other' })).toMatchObject({ needs_review: true, validation_error: NON_INVOICE_REVIEW_MESSAGE })
  })

  it('coerces a missing vendor / document number to "" and flags the row', () => {
    expect(fin({ vendor: null, doc_number: '5', total: 10 })).toMatchObject({ vendor: '', needs_review: true, validation_error: 'שם ספק חסר' })
    expect(fin({ vendor: 'A', doc_number: '  ', total: 10 })).toMatchObject({ doc_number: '', needs_review: true, validation_error: 'מספר מסמך חסר' })
    expect(fin({ vendor: '', doc_number: '', total: 10 })).toMatchObject({ validation_error: 'שם ספק ומספר מסמך חסרים' })
  })

  it('leaves a complete row alone', () => {
    const p = fin({ vendor: 'A', doc_number: '1', total: 118, pretax: 100, vat: 18, currency: 'ILS', doc_type: 'invoice' })
    expect(p.needs_review).toBeUndefined()
    expect(p.vat_derived).toBeUndefined()
    expect([p.pretax, p.vat]).toEqual([100, 18])
  })

  it('derives pretax/vat from the total when they are missing or do not reconcile (Ronen\'s VAT policy)', () => {
    expect(fin({ vendor: 'A', doc_number: '1', total: 118, currency: 'ILS', date: '01/03/2026' })).toMatchObject({ pretax: 100, vat: 18, vat_derived: true })
    expect(fin({ vendor: 'A', doc_number: '1', total: 118, pretax: 50, vat: 3, currency: 'ILS', date: '01/03/2026' })).toMatchObject({ pretax: 100, vat: 18, vat_derived: true })
    expect(fin({ vendor: 'A', doc_number: '1', total: 118, currency: 'ILS', date: '01/03/2024' })).toMatchObject({ pretax: 100.85, vat: 17.15 }) // 17% before 2025
  })

  it('does not derive for a missing or zero total (that stays with the validator)', () => {
    expect(fin({ vendor: 'A', doc_number: '1', total: 0, currency: 'ILS' }).vat_derived).toBeUndefined()
    expect(fin({ vendor: 'A', doc_number: '1', total: null, currency: 'ILS' }).vat_derived).toBeUndefined()
  })
})

// Decision 5 (2026-11-10): a credit note is stored with a NEGATIVE total, pre-tax and VAT.
describe('finalizeInvoicePayload — credit notes are stored negative', () => {
  it('a credit note arriving with positive amounts is stored negative (the Reconcept 58857 case: 1,400 + 252 = 1,652)', () => {
    const p = fin({ vendor: 'ריקונספט', doc_number: '58857', doc_type: 'credit_note', pretax: 1400, vat: 252, total: 1652, currency: 'ILS', date: '10/06/2026' })
    expect([p.pretax, p.vat, p.total]).toEqual([-1400, -252, -1652])
    expect(p.vat_derived).toBeUndefined() // the amounts reconcile: nothing to derive
    expect(p.needs_review).toBeUndefined()
  })

  it('a Hebrew title is read as a credit note too', () => {
    expect(fin({ vendor: 'A', doc_number: '1', doc_type: 'חשבונית זיכוי', total: 118, pretax: 100, vat: 18, currency: 'ILS' }).total).toBe(-118)
  })

  it('already-negative amounts stay as they are (no double flip)', () => {
    const p = fin({ vendor: 'A', doc_number: '1', doc_type: 'credit_note', total: -118, pretax: -100, vat: -18, currency: 'ILS' })
    expect([p.pretax, p.vat, p.total]).toEqual([-100, -18, -118])
  })

  it('VAT derived for a credit note with only a total comes out negative', () => {
    const p = fin({ vendor: 'A', doc_number: '1', doc_type: 'credit_note', total: 118, currency: 'ILS', date: '01/03/2026' })
    expect([p.pretax, p.vat, p.total, p.vat_derived]).toEqual([-100, -18, -118, true])
  })

  it('an invoice, a receipt and an unknown document keep their positive amounts', () => {
    for (const doc_type of ['invoice', 'receipt', 'invoice_receipt', 'unknown']) {
      const p = fin({ vendor: 'A', doc_number: '1', doc_type, total: 118, pretax: 100, vat: 18, currency: 'ILS' })
      expect([p.pretax, p.vat, p.total], doc_type).toEqual([100, 18, 118])
    }
  })
})
