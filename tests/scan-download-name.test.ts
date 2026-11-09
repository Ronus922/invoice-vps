import { describe, it, expect } from 'vitest'
import { cleanNamePart, contentDisposition, encodeRfc5987, receiptFileName, receiptStoredName } from '@/lib/scan/downloadName'

describe('receiptFileName: {vendor}_{doc_number}_{doc_date}.jpg', () => {
  it('joins the three parts', () => {
    expect(receiptFileName({ vendor: 'שופרסל דיל', docNumber: '4455', docDate: '2026-11-09' })).toBe('שופרסל דיל_4455_2026-11-09.jpg')
  })
  it('leaves out what is missing, and falls back to "receipt"', () => {
    expect(receiptFileName({ vendor: 'AM:PM', docNumber: '', docDate: '' })).toBe('AM_PM.jpg')
    expect(receiptFileName({ vendor: '', docNumber: '', docDate: null })).toBe('receipt.jpg')
    expect(receiptFileName({ vendor: 'x', docNumber: '1', docDate: '09/11/2026' })).toBe('x_1.jpg') // only ISO dates go in
  })
  it('makes the worst names legal on every OS', () => {
    const name = receiptFileName({ vendor: 'a/b\\c:d*e?f"g<h>i|j', docNumber: '  ..12.. ', docDate: '2026-01-02' })
    expect(name).toBe('a_b_c_d_e_f_g_h_i_j_12_2026-01-02.jpg')
    expect(cleanNamePart('‮evil​\u0007name')).toBe('evilname')
    expect(cleanNamePart('.hidden')).toBe('hidden')
  })
  it('caps each part at 32 code points without splitting a surrogate pair', () => {
    const long = '😀'.repeat(40)
    const part = cleanNamePart(long)
    expect(Array.from(part)).toHaveLength(32)
    expect(() => encodeURIComponent(part)).not.toThrow()
    expect(new TextEncoder().encode(receiptFileName({ vendor: 'ש'.repeat(50), docNumber: 'ש'.repeat(50), docDate: '2026-01-02' })).length).toBeLessThanOrEqual(255)
  })
})

describe('Content-Disposition (RFC 5987)', () => {
  it("encodes ' ( ) * too — encodeURIComponent leaves them alone and they break filename*=", () => {
    expect(encodeRfc5987("it's (1)*")).toBe('it%27s%20%281%29%2A')
    expect(encodeRfc5987('שלום')).toBe('%D7%A9%D7%9C%D7%95%D7%9D')
  })
  it('carries Hebrew in filename*= and a plain ASCII fallback in filename=', () => {
    const h = contentDisposition('attachment', "שופרסל (סניף 5)_123_2026-11-09.jpg")
    expect(h.startsWith('attachment; filename="')).toBe(true)
    expect(h).toContain("filename*=UTF-8''%D7%A9")
    expect(h).toContain('%28%D7%A1') // the "(" is encoded
    const encoded = h.split("filename*=UTF-8''")[1]!
    expect(encoded).not.toMatch(/[()'*]/) // no raw ( ) ' * inside the encoded value
    const ascii = /filename="([^"]*)"/.exec(h)![1]!
    expect(/^[\x20-\x7e]*$/.test(ascii)).toBe(true)
    expect(ascii).toContain('123_2026-11-09.jpg')
  })
  it('falls back to receipt.jpg when nothing ASCII survives', () => {
    expect(contentDisposition('inline', 'שופרסל.jpg')).toContain('filename="receipt.jpg"')
    expect(contentDisposition('inline', 'x.jpg').startsWith('inline;')).toBe(true)
  })
})

describe('receiptStoredName: the name the accountant e-mail, the Drive backup and the ZIP export key on', () => {
  const base = { vendor: 'שופרסל', docNumber: '4455', docDate: '2026-11-09' }
  it('adds the document type, so a tax invoice and a receipt with the same number and date never collide', () => {
    expect(receiptStoredName({ ...base, docType: 'receipt' })).toBe('שופרסל_4455_2026-11-09_receipt.jpg')
    expect(receiptStoredName({ ...base, docType: 'invoice' })).toBe('שופרסל_4455_2026-11-09_invoice.jpg')
    expect(receiptStoredName({ ...base, docType: 'receipt' })).not.toBe(receiptStoredName({ ...base, docType: 'invoice' }))
  })
  it('leaves an unknown type out, like the exporters\' own fallback name, and never trusts a free-text type', () => {
    expect(receiptStoredName({ ...base, docType: 'unknown' })).toBe('שופרסל_4455_2026-11-09.jpg')
    expect(receiptStoredName({ ...base, docType: null })).toBe('שופרסל_4455_2026-11-09.jpg')
    expect(receiptStoredName({ ...base, docType: '../../x' })).toBe('שופרסל_4455_2026-11-09.jpg')
  })
  it('the download button keeps the plain {vendor}_{doc_number}_{doc_date}.jpg', () => {
    expect(receiptFileName(base)).toBe('שופרסל_4455_2026-11-09.jpg')
  })
})
