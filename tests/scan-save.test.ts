import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NON_INVOICE_REVIEW_MESSAGE } from '@/lib/doc-type'
import { ScanImageError, type CompressedImage } from '@/lib/scan/image'
import type { DuplicateInfo } from '@/lib/scan/model'
import { saveScannedReceipt, type SaveInput } from '@/lib/scan/save'
import { findDuplicateIn, type InsertResult, type ScanStore } from '@/lib/scan/store'
import { scanSaveSchema, type ScanSaveData } from '@/lib/scan/validation'

// The invariant of the whole feature: a scanned receipt takes the SAME road into the SAME table as every
// other document — the duplicate is looked up first and shown, the row goes through the shared
// normalisation, the table's unique index has the last word — and nothing is left behind on a failure.

const ACTOR = '11111111-2222-3333-4444-555555555555'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
const img = (n = 1234): CompressedImage => ({ bytes: Buffer.alloc(n, 1), format: 'jpeg', contentType: 'image/jpeg', ext: 'jpg', width: 800, height: 1200, quality: null })

const EXISTING: DuplicateInfo = {
  id: 'aaaaaaaa-0000-0000-0000-000000000000', vendor: 'שופרסל', doc_number: '4455', doc_type: 'receipt', date: '01/11/2026',
  total: 45, currency: 'ILS', source: 'gmail', created_at: '2026-11-01T10:00:00Z',
}

function data(over: Partial<ScanSaveData> = {}): ScanSaveData {
  return scanSaveSchema.parse({
    doc_type: 'receipt', vendor: 'שופרסל', vendor_tax_id: '512345678', doc_number: '4455', date: '2026-11-09',
    pretax: 38.14, vat: 6.86, total: 45, currency: 'ILS', payment_method: 'אשראי', ...over,
  })
}

function fakeStore(over: Partial<{ existing: DuplicateInfo | null; existingAfterRace: DuplicateInfo | null; insert: InsertResult; uploadFails: boolean }> = {}) {
  const log: string[] = []
  let lookups = 0
  const inserted: Record<string, unknown>[] = []
  const store: ScanStore = {
    async findDuplicate() {
      log.push('find')
      lookups += 1
      return lookups === 1 ? (over.existing ?? null) : (over.existingAfterRace ?? null)
    },
    async uploadPhoto() {
      log.push('upload')
      if (over.uploadFails) throw new Error('storage down')
      return { path: 'invoices/abc.jpg', fileUrl: 'https://x/storage/v1/object/public/invoice-files/invoices/abc.jpg' }
    },
    async removePhoto(path) { log.push(`remove:${path}`); return true },
    async insertInvoice(row) {
      log.push('insert')
      inserted.push(row)
      return over.insert ?? { ok: true, row: { ...row, id: 'new-id' } }
    },
  }
  return { store, log, inserted }
}

const run = (store: ScanStore, d: ScanSaveData, extra: Partial<SaveInput> = {}) =>
  saveScannedReceipt(store, { data: d, image: JPEG, actorId: ACTOR, compress: async () => img(), now: () => new Date('2026-11-09T12:00:00Z'), ...extra })

describe('the duplicate is looked up FIRST and handed back — never silently dropped', () => {
  it('an existing (vendor, doc_number, doc_type) stops the save before the photo is processed, stored or inserted', async () => {
    const { store, log } = fakeStore({ existing: EXISTING })
    const compress = vi.fn(async () => img())
    const res = await run(store, data(), { compress })
    expect(res).toEqual({ kind: 'duplicate', existing: EXISTING })
    expect(log).toEqual(['find']) // no upload, no insert
    expect(compress).not.toHaveBeenCalled()
  })

  it('a race the lookup could not see (the unique index fires) removes the stored photo and reports the duplicate', async () => {
    const { store, log } = fakeStore({ insert: { ok: false, duplicate: true }, existingAfterRace: EXISTING })
    const res = await run(store, data())
    expect(res).toEqual({ kind: 'duplicate', existing: EXISTING })
    expect(log).toEqual(['find', 'upload', 'insert', 'remove:invoices/abc.jpg', 'find'])
  })

  it('even if the second lookup finds nothing, a unique-index hit is still reported as a duplicate', async () => {
    const { store } = fakeStore({ insert: { ok: false, duplicate: true } })
    expect(await run(store, data())).toEqual({ kind: 'duplicate', existing: null })
  })

  it('looks up by the CANONICAL doc type (a free-text Hebrew label hits the same key the table uses)', async () => {
    const seen: unknown[] = []
    const { store } = fakeStore()
    store.findDuplicate = async (k) => { seen.push(k); return null }
    await run(store, data({ doc_type: 'חשבונית מס קבלה' }))
    expect(seen[0]).toEqual({ vendor: 'שופרסל', docNumber: '4455', docType: 'invoice_receipt' })
  })
})

describe('a successful save enters the table as a scan', () => {
  it('writes source, scanned_by, created_by, image_bytes, the table\'s date format and the download name', async () => {
    const { store, inserted } = fakeStore()
    const res = await run(store, data())
    expect(res.kind).toBe('saved')
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      source: 'scan', scanned_by: ACTOR, created_by: ACTOR, image_bytes: 1234,
      date: '09/11/2026', file_name: 'שופרסל_4455_2026-11-09.jpg', vendor_tax_id: '512345678',
      file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/abc.jpg',
      doc_type: 'receipt', total: 45, needs_review: false, currency: 'ILS',
    })
    expect(inserted[0]!.extraction_raw).toMatchObject({ source: 'scan', model: expect.any(String), scanned_at: '2026-11-09T12:00:00.000Z' })
  })

  it('the stored object is the verified photo: only what the pipeline returned is uploaded', async () => {
    const uploaded: unknown[] = []
    const { store } = fakeStore()
    store.uploadPhoto = async (i) => { uploaded.push(i); return { path: 'invoices/p.jpg', fileUrl: 'u' } }
    await run(store, data(), { compress: async () => img(777) })
    expect((uploaded[0] as CompressedImage).bytes.length).toBe(777)
  })
})

describe('the row goes through the SAME normalisation as POST /api/invoices', () => {
  const row = async (over: Partial<ScanSaveData>) => {
    const { store, inserted } = fakeStore()
    const res = await run(store, data(over))
    expect(res.kind).toBe('saved')
    return inserted[0]!
  }

  it('a proforma / non-invoice ("חשבונית עסקה", doc_type other) is held for review — never auto-sent', async () => {
    expect(await row({ doc_type: 'other' })).toMatchObject({ doc_type: 'other', needs_review: true, validation_error: NON_INVOICE_REVIEW_MESSAGE })
  })
  it('a missing vendor or document number is saved but flagged', async () => {
    expect(await row({ doc_number: '' })).toMatchObject({ doc_number: '', needs_review: true, validation_error: 'מספר מסמך חסר' })
    expect(await row({ vendor: '' })).toMatchObject({ vendor: '', needs_review: true, validation_error: 'שם ספק חסר' })
  })
  it('a missing or zero total is flagged, not rejected (the file is kept)', async () => {
    expect(await row({ total: null, pretax: null, vat: null })).toMatchObject({ total: 0, needs_review: true })
    expect(await row({ total: 0, pretax: null, vat: null })).toMatchObject({ needs_review: true })
  })
  it('VAT policy: missing or unbalanced VAT is DERIVED from the total, and the row is NOT blocked', async () => {
    expect(await row({ pretax: null, vat: null, total: 118 })).toMatchObject({ pretax: 100, vat: 18, vat_derived: true, needs_review: false })
    expect(await row({ pretax: 50, vat: 3, total: 118 })).toMatchObject({ pretax: 100, vat: 18, vat_derived: true, needs_review: false })
    const { store, inserted } = fakeStore()
    await run(store, data({ pretax: 50, vat: 3, total: 118 }))
    expect((inserted[0]!.extraction_raw as Record<string, unknown>).vat_derivation).toMatchObject({ original: { pretax: 50, vat: 3 } })
  })
  it('a balanced pair is left exactly as typed', async () => {
    expect(await row({ pretax: 100, vat: 18, total: 118 })).toMatchObject({ pretax: 100, vat: 18, needs_review: false })
    expect((await row({ pretax: 100, vat: 18, total: 118 })).vat_derived).toBeUndefined()
  })
  it('a credit note (negative total) is valid', async () => {
    expect(await row({ doc_type: 'credit_note', pretax: -100, vat: -18, total: -118 })).toMatchObject({ total: -118, needs_review: false })
  })
  it('an unknown currency code falls back to ILS; a foreign one is kept', async () => {
    expect(await row({ currency: '??' })).toMatchObject({ currency: 'ILS' })
    expect(await row({ currency: 'usd', pretax: null, vat: null, total: 50 })).toMatchObject({ currency: 'USD', pretax: 50, vat: 0 })
  })
  it('no date is stored as NULL, not as an invalid string', async () => {
    expect(await row({ date: '' })).toMatchObject({ date: null })
  })
})

describe('nothing is left behind on a failure', () => {
  it('an insert error removes the stored photo', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { store, log } = fakeStore({ insert: { ok: false, duplicate: false, message: 'db down' } })
    expect(await run(store, data())).toEqual({ kind: 'failed', stage: 'insert' })
    expect(log).toContain('remove:invoices/abc.jpg')
    quiet.mockRestore()
  })
  it('a thrown insert removes it too', async () => {
    const { store, log } = fakeStore()
    store.insertInvoice = async () => { throw new Error('network') }
    expect(await run(store, data())).toEqual({ kind: 'failed', stage: 'insert' })
    expect(log).toContain('remove:invoices/abc.jpg')
  })
  it('an upload failure inserts nothing', async () => {
    const { store, log } = fakeStore({ uploadFails: true })
    expect(await run(store, data())).toEqual({ kind: 'failed', stage: 'upload' })
    expect(log).not.toContain('insert')
  })
  it('a photo the pipeline refuses stores and inserts nothing', async () => {
    const { store, log } = fakeStore()
    const res = await run(store, data(), { compress: async () => { throw new ScanImageError('corrupt') } })
    expect(res).toMatchObject({ kind: 'bad_image' })
    expect(log).toEqual(['find'])
  })
  it('a failing duplicate lookup stops the save rather than guessing', async () => {
    const { store, log } = fakeStore()
    store.findDuplicate = async () => { throw new Error('db down') }
    expect(await run(store, data())).toEqual({ kind: 'failed', stage: 'lookup' })
    expect(log).toEqual([])
  })
})

describe('the request body cannot set anything it should not', () => {
  it('drops source, scanned_by, needs_review, created_by, file_url and id', () => {
    const parsed = scanSaveSchema.parse({
      doc_type: 'receipt', vendor: 'A', doc_number: '1', date: '', pretax: null, vat: null, total: 1, currency: 'ILS',
      source: 'gmail', scanned_by: 'someone-else', needs_review: false, created_by: 'x', file_url: 'https://evil', id: 'forced',
    })
    for (const k of ['source', 'scanned_by', 'needs_review', 'created_by', 'file_url', 'id']) expect(parsed).not.toHaveProperty(k)
  })
  it('rejects absurd amounts and an oversized OCR snapshot', () => {
    const base = { doc_type: 'receipt', vendor: 'A', doc_number: '1', date: '', pretax: null, vat: null, currency: 'ILS' }
    expect(scanSaveSchema.safeParse({ ...base, total: 1e12 }).success).toBe(false)
    expect(scanSaveSchema.safeParse({ ...base, total: Number.NaN }).success).toBe(false)
    expect(scanSaveSchema.safeParse({ ...base, total: 1, ocr_fields: { x: 'y'.repeat(5000) } }).success).toBe(false)
  })
})

describe('findDuplicateIn — the identity lookup', () => {
  function fakeDb(rows: Record<string, unknown>[], error: { code: string } | null = null) {
    const eqs: [string, unknown][] = []
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (c: string, v: unknown) => { eqs.push([c, v]); return q }
    q.limit = async () => ({ data: rows, error })
    const from = vi.fn(() => q)
    return { db: { from } as unknown as SupabaseClient, eqs, from }
  }
  const row = (vendor: string) => ({ ...EXISTING, vendor })

  it('matches on doc_number + canonical doc_type in the query, then on the vendor', async () => {
    const { db, eqs } = fakeDb([row('שופרסל')])
    expect(await findDuplicateIn(db, { vendor: 'שופרסל', docNumber: ' 4455 ', docType: 'קבלה' })).toMatchObject({ id: EXISTING.id })
    expect(eqs).toEqual([['doc_number', '4455'], ['doc_type', 'receipt']])
  })
  it('treats vendor spellings that differ only by case, quotes or spacing as the same vendor', async () => {
    const { db } = fakeDb([row('Super  "Pharm"')])
    expect(await findDuplicateIn(db, { vendor: 'super pharm', docNumber: '1', docType: 'receipt' })).not.toBeNull()
  })
  it('a different vendor with the same number is not a duplicate', async () => {
    const { db } = fakeDb([row('מגה')])
    expect(await findDuplicateIn(db, { vendor: 'שופרסל', docNumber: '4455', docType: 'receipt' })).toBeNull()
  })
  it('no document number means no identity: nothing is queried', async () => {
    const { db, from } = fakeDb([row('שופרסל')])
    expect(await findDuplicateIn(db, { vendor: 'שופרסל', docNumber: '  ', docType: 'receipt' })).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })
  it('a lookup error is thrown, not read as "no duplicate"', async () => {
    const { db } = fakeDb([], { code: '57P01' })
    await expect(findDuplicateIn(db, { vendor: 'x', docNumber: '1', docType: 'receipt' })).rejects.toThrow('duplicate_lookup_failed')
  })
})
