import { describe, expect, it } from 'vitest'
import {
  documentIdentity,
  findDuplicateInList,
  identityKey,
  isSameDocument,
  normalizeDocDate,
  normalizeDocNumber,
  normalizeTaxId,
  totalToCents,
} from '@/lib/doc-identity'
import { normalizeVendorName } from '@/lib/vendor-utils'

// The identity of a document: normalised doc_number + date + total, + vendor_tax_id when BOTH sides have one.
// The vendor's spelling and the doc type are NOT part of it.

describe('normalizeDocNumber', () => {
  it('drops spaces, hyphens, other separators and leading zeros', () => {
    expect(normalizeDocNumber('00570106008278')).toBe('570106008278')
    expect(normalizeDocNumber('0057-0106 008278')).toBe('570106008278')
    expect(normalizeDocNumber(' 1011014259 ')).toBe('1011014259')
    expect(normalizeDocNumber('IN26/099045')).toBe('IN26099045')
    expect(normalizeDocNumber('NLP4TMQ8-0008')).toBe('NLP4TMQ80008')
  })
  it('is case-insensitive and keeps Hebrew letters', () => {
    expect(normalizeDocNumber('in-26099045')).toBe('IN26099045')
    expect(normalizeDocNumber('א-123')).toBe('א123')
  })
  it('accepts a number', () => {
    expect(normalizeDocNumber(1011014259)).toBe('1011014259')
  })
  it('gives "" when there is nothing to compare (empty, zeros only, junk, wrong type)', () => {
    for (const v of ['', '   ', '0', '000', '---', null, undefined, {}]) expect(normalizeDocNumber(v)).toBe('')
  })
  it('does not merge different numbers', () => {
    expect(normalizeDocNumber('005701308527')).not.toBe(normalizeDocNumber('00570106008278'))
    expect(normalizeDocNumber('21800373')).not.toBe(normalizeDocNumber('21800377'))
  })
})

describe('normalizeDocDate', () => {
  it('reads the table format and the form format as the same day', () => {
    expect(normalizeDocDate('08/11/2026')).toBe('2026-11-08')
    expect(normalizeDocDate('2026-11-08')).toBe('2026-11-08')
    expect(normalizeDocDate('8.11.2026')).toBe('2026-11-08')
  })
  it("gives '' for a missing or unreadable date, including the table's '<UNKNOWN>'", () => {
    for (const v of ['', '<UNKNOWN>', '31/02/2026', null, undefined]) expect(normalizeDocDate(v)).toBe('')
  })
})

describe('totalToCents', () => {
  it('rounds to cents, accepts numbers and numeric strings', () => {
    expect(totalToCents(155.7)).toBe(15570)
    expect(totalToCents('155.70')).toBe(15570)
    expect(totalToCents(61.1)).toBe(6110)
    expect(totalToCents(0.1 + 0.2)).toBe(30)
  })
  it('gives null for 0, empty, NaN and non-numbers (a failed read has nothing to compare)', () => {
    for (const v of [0, '0', '', '  ', 'abc', NaN, Infinity, null, undefined]) expect(totalToCents(v)).toBeNull()
  })
  it('keeps the sign (a credit note is not the invoice it cancels)', () => {
    expect(totalToCents(-61.1)).toBe(-6110)
  })
})

describe('normalizeTaxId', () => {
  it('keeps the digits of an 8–9 digit company / dealer number', () => {
    expect(normalizeTaxId('51-234567-8')).toBe('512345678')
    expect(normalizeTaxId(12345678)).toBe('12345678')
  })
  it('anything else counts as absent — a garbled id cannot make the same document "another issuer"', () => {
    for (const v of [null, undefined, '', '5123456', '5123456789', 'IE3206488LH', {}]) expect(normalizeTaxId(v)).toBe('')
  })
})

describe('documentIdentity', () => {
  it('has none without a document number or without a total', () => {
    expect(documentIdentity({ doc_number: '', date: '01/03/2026', total: 61.1 })).toBeNull()
    expect(documentIdentity({ doc_number: '0000', date: '01/03/2026', total: 61.1 })).toBeNull()
    expect(documentIdentity({ doc_number: '123', date: '01/03/2026', total: 0 })).toBeNull()
    expect(documentIdentity({ doc_number: '123', date: '01/03/2026', total: null })).toBeNull()
  })
  it('is built from the normalised parts', () => {
    expect(documentIdentity({ doc_number: '00-123', date: '08/11/2026', total: '155.70', vendor_tax_id: '51-234567-8' })).toEqual({
      docNumber: '123', date: '2026-11-08', totalCents: 15570, taxId: '512345678',
    })
  })
  it("a missing date ('', '<UNKNOWN>', null) is an identity with an empty date; a date that is written but unreadable is NO identity", () => {
    for (const date of ['', '<UNKNOWN>', 'unknown', null, undefined]) expect(documentIdentity({ doc_number: '123', date, total: 5 })?.date).toBe('')
    for (const date of ['31/02/2026', 'Mar 5 2026', '2026/03/05', '5/3']) expect(documentIdentity({ doc_number: '123', date, total: 5 })).toBeNull()
  })
  it('identityKey is the same for the same number, date and total — whatever the tax id', () => {
    const a = documentIdentity({ doc_number: '0123', date: '08/11/2026', total: 5, vendor_tax_id: '512345678' })!
    const b = documentIdentity({ doc_number: '123', date: '2026-11-08', total: '5.00' })!
    expect(identityKey(a)).toBe(identityKey(b))
  })
})

const base = { doc_number: '1011014259', date: '08/11/2026', total: 155.7 }
const same = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const x = documentIdentity(a)
  const y = documentIdentity(b)
  return x !== null && y !== null && isSameDocument(x, y)
}

describe('isSameDocument', () => {
  it('ignores zeros, spaces and hyphens in the number, and the date format', () => {
    expect(same(base, { doc_number: '00 1011-014259', date: '2026-11-08', total: '155.7' })).toBe(true)
  })
  it('differs on the number, the date or the total', () => { // (a readable date; an unreadable one has no identity at all)
    expect(same(base, { ...base, doc_number: '1011014260' })).toBe(false)
    expect(same(base, { ...base, date: '09/11/2026' })).toBe(false)
    expect(same(base, { ...base, total: 155.71 })).toBe(false)
  })
  it('two unknown dates match each other; an unknown date never matches a real one', () => {
    expect(same({ ...base, date: '<UNKNOWN>' }, { ...base, date: '' })).toBe(true)
    expect(same({ ...base, date: '<UNKNOWN>' }, base)).toBe(false)
  })
  it('the tax id counts only when BOTH sides have one — then they must agree', () => {
    expect(same({ ...base, vendor_tax_id: '512345678' }, { ...base, vendor_tax_id: '512345678' })).toBe(true)
    expect(same({ ...base, vendor_tax_id: '512345678' }, { ...base, vendor_tax_id: '999999999' })).toBe(false)
    expect(same({ ...base, vendor_tax_id: '512345678' }, { ...base, vendor_tax_id: '' })).toBe(true)
    expect(same({ ...base, vendor_tax_id: '512345678' }, { ...base, vendor_tax_id: '5123' })).toBe(true) // a garbled id is absent
    expect(same({ ...base, vendor_tax_id: null }, { ...base, vendor_tax_id: '512345678' })).toBe(true)
  })
  it('neither the vendor spelling nor the document type is part of it', () => {
    expect(same({ ...base, vendor: 'MAX', doc_type: 'invoice_receipt' }, { ...base, vendor: 'ביג מקס', doc_type: 'unknown' })).toBe(true)
  })
})

describe('findDuplicateInList — the browser-side pre-check', () => {
  // The two rows of 2026-11-09/10: the phone scan, then the same receipt as a PDF from the watched folder.
  const scanned = {
    id: 'scan-row-0001', vendor: 'MAX סטוק ביג מקס קריח חיים', doc_number: '1011014259', doc_type: 'invoice_receipt',
    date: '08/11/2026', total: 155.7, source: 'scan',
  }
  const others = [
    { id: 'x1', vendor: 'שופרסל', doc_number: '55', doc_type: 'receipt', date: '08/11/2026', total: 155.7 },
    { id: 'x2', vendor: 'MAX', doc_number: '1011014259', doc_type: 'invoice_receipt', date: '08/11/2026', total: 99 },
  ]

  it('MAX / "ביג מקס" 1011014259 of 08/11/2026, 155.70 ₪: the folder PDF with another vendor spelling IS the same document', () => {
    const fromFolder = { vendor: 'מקס סטוק - אדמירלטי חלוצי התעשייה', doc_number: '1011014259', date: '08/11/2026', total: 155.7, doc_type: 'invoice_receipt' }
    // the old identity (vendor + number + type) did not see it: the spellings differ
    expect(normalizeVendorName(fromFolder.vendor)).not.toBe(normalizeVendorName(scanned.vendor))
    expect(findDuplicateInList([...others, scanned], fromFolder)).toBe(scanned)
  })
  it('finds nothing for a different total, number or date', () => {
    const list = [...others, scanned]
    expect(findDuplicateInList(list, { ...scanned, total: 155.8 })).toBeNull()
    expect(findDuplicateInList(list, { ...scanned, doc_number: '1011014260' })).toBeNull()
    expect(findDuplicateInList(list, { ...scanned, date: '09/11/2026' })).toBeNull()
  })
  it('a candidate without an identity (no number / no total) is never a duplicate', () => {
    expect(findDuplicateInList([scanned], { ...scanned, doc_number: '' })).toBeNull()
    expect(findDuplicateInList([scanned], { ...scanned, total: 0 })).toBeNull()
  })
  it('rows without an identity in the list are skipped, not crashed on', () => {
    expect(findDuplicateInList([{ doc_number: null, total: null }, scanned], scanned)).toBe(scanned)
  })
})
