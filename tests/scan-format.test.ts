import { describe, it, expect } from 'vitest'
import {
  formatAmount, fromStoredDate, lowConfidenceFields, normalizeConfidence, parseAmount, toIsoDate, toSavePayload, toStoredDate,
} from '@/lib/scan/format'
import { EMPTY_SCAN_VALUES, OCR_LOW_CONFIDENCE, scanTargetSize, type ScanValues } from '@/lib/scan/model'

describe('dates: the form speaks ISO, the table speaks DD/MM/YYYY', () => {
  it('reads what a receipt prints', () => {
    expect(toIsoDate('09/11/2026')).toBe('2026-11-09')
    expect(toIsoDate('9.1.26')).toBe('2026-01-09')
    expect(toIsoDate('09-11-2026')).toBe('2026-11-09')
    expect(toIsoDate('2026-11-09')).toBe('2026-11-09')
  })
  it('rejects what is not a real day', () => {
    for (const bad of ['31/02/2026', '2026-13-01', '00/01/2026', 'yesterday', '', '12/2026', null, 5]) expect(toIsoDate(bad)).toBe('')
  })
  it('stores DD/MM/YYYY like every existing row and round-trips', () => {
    expect(toStoredDate('2026-11-09')).toBe('09/11/2026')
    expect(toStoredDate('')).toBeNull()
    expect(fromStoredDate('09/11/2026')).toBe('2026-11-09')
    expect(fromStoredDate(null)).toBe('')
  })
})

describe('amounts', () => {
  it('parses what is typed', () => {
    expect(parseAmount('1,234.50')).toBe(1234.5)
    expect(parseAmount('1234,5')).toBe(1234.5)
    expect(parseAmount('12.90')).toBe(12.9)
    expect(parseAmount('-104.1')).toBe(-104.1) // credit notes are negative and valid
    expect(parseAmount('₪ 45')).toBe(45)
  })
  it('returns null for nothing or junk — never 0', () => {
    for (const bad of ['', '  ', '-', 'abc', '.']) expect(parseAmount(bad)).toBeNull()
  })
  it('formats with two decimals', () => {
    expect(formatAmount(790.6)).toBe('790.60')
    expect(formatAmount(null)).toBe('')
  })
})

describe('confidence', () => {
  it('reads 0–1, and 0–100 as a percentage', () => {
    expect(normalizeConfidence(0.82)).toBe(0.82)
    expect(normalizeConfidence(1)).toBe(1)
    expect(normalizeConfidence(65)).toBe(0.65)
    expect(normalizeConfidence(-1)).toBeUndefined()
    expect(normalizeConfidence(250)).toBeUndefined()
    expect(normalizeConfidence('0.9')).toBeUndefined()
  })
  it('paints yellow exactly the fields that were read below 0.7', () => {
    const values: ScanValues = { ...EMPTY_SCAN_VALUES, vendor: 'שופרסל', doc_number: '123', total: '45.00', vat: '' }
    const low = lowConfidenceFields(values, { vendor: 0.69, doc_number: OCR_LOW_CONFIDENCE, total: 0.2, vat: 0.1, date: 0.3 })
    expect([...low].sort()).toEqual(['total', 'vendor']) // 0.7 is not low; an empty field says nothing
  })
})

describe('scanTargetSize', () => {
  it('shrinks to the cap, never enlarges', () => {
    expect(scanTargetSize(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 })
    expect(scanTargetSize(800, 600, 1600)).toEqual({ w: 800, h: 600 })
  })
  it('lets a strip run longer so its width stays readable', () => {
    expect(scanTargetSize(1200, 7200, 1600)).toEqual({ w: 667, h: 4000 })
    expect(scanTargetSize(7200, 1200, 1600)).toEqual({ w: 4000, h: 667 })
    expect(scanTargetSize(500, 4000, 1600)).toEqual({ w: 500, h: 4000 }) // already thin: not enlarged, long side within 4000
  })
})

describe('the save payload', () => {
  it('carries what Ronen approved, with numbers parsed and nothing he cannot set', () => {
    const values: ScanValues = {
      ...EMPTY_SCAN_VALUES, doc_type: 'receipt', vendor: ' שופרסל ', vendor_tax_id: '512345678', doc_number: '77', date: '2026-11-09',
      pretax: '38.14', vat: '6.86', total: '45,00', currency: 'ILS', payment_method: 'אשראי',
    }
    const body = toSavePayload(values, { description: 'מצרכים', category: 'אחר' }, { ok: true, fields: values })
    expect(body).toMatchObject({ vendor: 'שופרסל', total: 45, pretax: 38.14, vat: 6.86, date: '2026-11-09', ocr_ok: true })
    for (const forbidden of ['source', 'scanned_by', 'needs_review', 'created_by', 'file_url', 'id']) expect(body).not.toHaveProperty(forbidden)
  })
})
