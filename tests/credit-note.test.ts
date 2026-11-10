import { describe, expect, it } from 'vitest'
import { applyCreditNoteSign } from '@/lib/credit-note'

// Decision 5 (2026-11-10): a credit note is stored with a NEGATIVE total, pre-tax and VAT, even though the
// document prints them positive.

describe('applyCreditNoteSign', () => {
  it('flips a credit note printed positive: 1,400 + 252 = 1,652 becomes -1,400 / -252 / -1,652', () => {
    const f = { doc_type: 'credit_note', pretax: 1400, vat: 252, total: 1652 }
    expect(applyCreditNoteSign(f)).toBe(true)
    expect(f).toEqual({ doc_type: 'credit_note', pretax: -1400, vat: -252, total: -1652 })
  })

  it('is idempotent: already-negative amounts stay negative, a second pass changes nothing', () => {
    const f = { doc_type: 'credit_note', pretax: -47.05, vat: -8.47, total: -55.52 }
    expect(applyCreditNoteSign(f)).toBe(false)
    expect(f).toEqual({ doc_type: 'credit_note', pretax: -47.05, vat: -8.47, total: -55.52 })
    const g = { doc_type: 'credit_note', pretax: 89, vat: 16.02, total: 105.02 }
    applyCreditNoteSign(g)
    expect(applyCreditNoteSign(g)).toBe(false)
    expect(g.total).toBe(-105.02)
  })

  it('a mix (VAT already negative, total printed positive) ends all negative', () => {
    const f = { doc_type: 'credit_note', pretax: 100, vat: -18, total: 118 }
    applyCreditNoteSign(f)
    expect(f).toEqual({ doc_type: 'credit_note', pretax: -100, vat: -18, total: -118 })
  })

  it('zero VAT (exempt) and missing amounts are left alone', () => {
    const f = { doc_type: 'credit_note', pretax: 1002, vat: 0, total: 1002 }
    applyCreditNoteSign(f)
    expect(f).toEqual({ doc_type: 'credit_note', pretax: -1002, vat: 0, total: -1002 })
    const g: { doc_type: string; pretax: number | null; vat: number | null; total: number } = { doc_type: 'credit_note', pretax: null, vat: null, total: 50 }
    applyCreditNoteSign(g)
    expect(g).toEqual({ doc_type: 'credit_note', pretax: null, vat: null, total: -50 })
  })

  it('amounts that arrive as strings are read like the API reads them ("1,234.50" → -1234.5)', () => {
    const f = { doc_type: 'credit_note', pretax: null, vat: '18.00', total: '1,234.50' }
    applyCreditNoteSign(f)
    expect(f.total).toBe(-1234.5)
    expect(f.vat).toBe(-18)
  })

  it('reads a Hebrew or English title as a credit note', () => {
    const he = { doc_type: 'חשבונית זיכוי', total: 10 }
    applyCreditNoteSign(he)
    expect(he.total).toBe(-10)
    const en = { doc_type: 'Credit Note', total: 10 }
    applyCreditNoteSign(en)
    expect(en.total).toBe(-10)
  })

  it('never touches any other document type — an invoice, a receipt, unknown keep their sign', () => {
    for (const t of ['invoice', 'receipt', 'invoice_receipt', 'other', 'unknown', null, undefined]) {
      const f = { doc_type: t, pretax: 100, vat: 18, total: 118 }
      expect(applyCreditNoteSign(f), String(t)).toBe(false)
      expect(f, String(t)).toEqual({ doc_type: t, pretax: 100, vat: 18, total: 118 })
    }
  })
})
