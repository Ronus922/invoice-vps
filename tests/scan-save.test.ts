import { describe, it, expect, vi } from 'vitest'
import { NON_INVOICE_REVIEW_MESSAGE } from '@/lib/doc-type'
import { ScanImageError, type CompressedImage } from '@/lib/scan/image'
import type { DuplicateInfo } from '@/lib/scan/model'
import { saveScannedReceipt, type SaveInput } from '@/lib/scan/save'
import { isScanObjectPath, type InsertResult, type ScanStore, type UpgradeResult } from '@/lib/scan/store'
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

function fakeStore(over: Partial<{ existing: DuplicateInfo | null; existingAfterRace: DuplicateInfo | null; insert: InsertResult; uploadFails: boolean; upgrade: UpgradeResult; upgradeThrows: boolean }> = {}) {
  const log: string[] = []
  let lookups = 0
  const inserted: Record<string, unknown>[] = []
  const upgrades: { id: string; input: { fileUrl: string; fileName: string; docType: string; vendorTaxId: string | null } }[] = []
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
    async upgradeInvoice(id, input) {
      log.push('upgrade')
      if (over.upgradeThrows) throw new Error('db down')
      upgrades.push({ id, input })
      return over.upgrade ?? { ok: true, row: { id, doc_type: input.docType, file_url: input.fileUrl }, sent: true, sendNote: null }
    },
  }
  return { store, log, inserted, upgrades }
}

const run = (store: ScanStore, d: ScanSaveData, extra: Partial<SaveInput> = {}) =>
  saveScannedReceipt(store, { data: d, image: JPEG, actorId: ACTOR, compress: async () => img(), now: () => new Date('2026-11-09T12:00:00Z'), ...extra })

describe('the duplicate is looked up FIRST and handed back — never silently dropped', () => {
  it('an existing row with the same document identity stops the save before the photo is processed, stored or inserted', async () => {
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

  it('looks up by the document identity — number, date, total, tax id — and not by the vendor or the doc type', async () => {
    const seen: unknown[] = []
    const { store } = fakeStore()
    store.findDuplicate = async (k) => { seen.push(k); return null }
    await run(store, data({ doc_type: 'חשבונית מס קבלה', vendor: 'כל שם אחר' }))
    expect(seen[0]).toEqual({ docNumber: '4455', date: '2026-11-09', total: 45, vendorTaxId: '512345678' })
  })

  it('asks the same question again after a unique-index hit, with the same key', async () => {
    const seen: unknown[] = []
    const { store } = fakeStore({ insert: { ok: false, duplicate: true } })
    const original = store.findDuplicate
    store.findDuplicate = async (k) => { seen.push(k); return original(k) }
    await run(store, data())
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
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
      date: '09/11/2026', file_name: 'שופרסל_4455_2026-11-09_receipt.jpg', vendor_tax_id: '512345678',
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
  it('a pair the OCR derived (sent as null) is derived at the FINAL date and currency, with the audit record', async () => {
    const { store, inserted } = fakeStore()
    await run(store, data({ pretax: null, vat: null, total: 118, date: '2024-03-01', ocr_read: { pretax: 50, vat: 3 } }))
    expect(inserted[0]).toMatchObject({ pretax: 100.85, vat: 17.15, vat_derived: true, needs_review: false }) // 17% before 2025
    expect(inserted[0]!.extraction_raw).toMatchObject({ vat_derivation: { original: { pretax: 50, vat: 3 } } }) // what the model read, not what it was filled with
    const usd = fakeStore()
    await run(usd.store, data({ pretax: null, vat: null, total: 50, currency: 'USD' }))
    expect(usd.inserted[0]).toMatchObject({ pretax: 50, vat: 0, vat_derived: true }) // a corrected foreign currency carries no Israeli VAT
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

describe('the image route only reads objects of the exact shape a scan stores', () => {
  it('accepts invoices/<uuid>.jpg', () => {
    expect(isScanObjectPath('invoices/ec4bfa54-f75c-4ab6-82c0-903883aeaf14.jpg')).toBe(true)
  })
  it('refuses traversal, other folders, other extensions and other buckets (source is writable through /api/invoices)', () => {
    for (const bad of [
      null, '', 'invoices/../other-bucket/x.jpg', '../x/ec4bfa54-f75c-4ab6-82c0-903883aeaf14.jpg', 'invoices/ec4bfa54-f75c-4ab6-82c0-903883aeaf14.pdf',
      'invoices/ec4bfa54-f75c-4ab6-82c0-903883aeaf14.jpg?x=1', 'invoices/ec4bfa54-f75c-4ab6-82c0-903883aeaf14.jpg/../../y', 'other/ec4bfa54-f75c-4ab6-82c0-903883aeaf14.jpg',
      'invoices/ec4bfa54-f75c-4ab6-82c0-903883aeaf1.jpg', 'invoices/sub/ec4bfa54-f75c-4ab6-82c0-903883aeaf14.jpg',
    ]) expect(isScanObjectPath(bad)).toBe(false)
  })
})

// Decision 1 (2026-11-10): a tax invoice scanned over a stored RECEIPT of the same transaction upgrades that row
// with the photo — no new row. A receipt over a tax invoice (or any other repeat) stays a duplicate; there is
// still no "save anyway".
describe('a scanned tax invoice upgrades a stored receipt of the same transaction', () => {
  it('invoice over a receipt: the photo is stored and the EXISTING row takes it and the type — nothing is inserted', async () => {
    const { store, log, inserted, upgrades } = fakeStore({ existing: EXISTING }) // EXISTING is a receipt
    const res = await run(store, data({ doc_type: 'invoice' }))
    expect(res).toEqual({ kind: 'upgraded', invoice: { id: EXISTING.id, doc_type: 'invoice', file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/abc.jpg' }, sent: true, sendNote: null })
    expect(log).toEqual(['find', 'upload', 'upgrade']) // no insert, no photo removal
    expect(inserted).toHaveLength(0)
    expect(upgrades).toHaveLength(1)
    expect(upgrades[0]!.id).toBe(EXISTING.id)
    expect(upgrades[0]!.input.docType).toBe('invoice')
    expect(upgrades[0]!.input.fileUrl).toMatch(/invoices\/abc\.jpg$/)
    expect(upgrades[0]!.input.fileName).toMatch(/\.jpg$/)
  })

  it('the tax id the scan read is handed to the upgrade (the rule "same issuer or no upgrade" lives there)', async () => {
    const { store, upgrades } = fakeStore({ existing: EXISTING })
    await run(store, data({ doc_type: 'invoice', vendor_tax_id: '512345678' }))
    expect(upgrades[0]!.input.vendorTaxId).toBe('512345678')
    const none = fakeStore({ existing: EXISTING })
    await run(none.store, data({ doc_type: 'invoice', vendor_tax_id: '' }))
    expect(none.upgrades[0]!.input.vendorTaxId).toBeNull()
  })

  it('whether the tax invoice REALLY went to the accountant travels with the result — the screen says "sent" only from this', async () => {
    const sent = fakeStore({ existing: EXISTING, upgrade: { ok: true, row: { id: EXISTING.id }, sent: true, sendNote: null } })
    expect(await run(sent.store, data({ doc_type: 'invoice' }))).toMatchObject({ kind: 'upgraded', sent: true, sendNote: null })
    const notSent = fakeStore({ existing: EXISTING, upgrade: { ok: true, row: { id: EXISTING.id }, sent: false, sendNote: 'gmail_not_connected' } })
    expect(await run(notSent.store, data({ doc_type: 'invoice' }))).toMatchObject({ kind: 'upgraded', sent: false, sendNote: 'gmail_not_connected' })
  })

  it('a tax invoice/receipt upgrades too', async () => {
    const { store, upgrades } = fakeStore({ existing: EXISTING })
    const res = await run(store, data({ doc_type: 'invoice_receipt' }))
    expect(res.kind).toBe('upgraded')
    expect(upgrades[0]!.input.docType).toBe('invoice_receipt')
  })

  it('a receipt over a receipt is a duplicate: nothing is uploaded or changed', async () => {
    const { store, log } = fakeStore({ existing: EXISTING })
    expect(await run(store, data({ doc_type: 'receipt' }))).toEqual({ kind: 'duplicate', existing: EXISTING })
    expect(log).toEqual(['find'])
  })

  it('a receipt over a stored TAX INVOICE is a duplicate', async () => {
    const taxInvoice = { ...EXISTING, doc_type: 'invoice' as const }
    const { store, log } = fakeStore({ existing: taxInvoice })
    expect(await run(store, data({ doc_type: 'receipt' }))).toEqual({ kind: 'duplicate', existing: taxInvoice })
    expect(log).toEqual(['find'])
  })

  it('an invoice over a stored invoice (or an unknown row) is a duplicate: only a RECEIPT is ever replaced', async () => {
    for (const stored of ['invoice', 'invoice_receipt', 'unknown', 'credit_note'] as const) {
      const { store, log } = fakeStore({ existing: { ...EXISTING, doc_type: stored } })
      expect((await run(store, data({ doc_type: 'invoice' }))).kind, stored).toBe('duplicate')
      expect(log, stored).toEqual(['find'])
    }
  })

  it('the row changed in the meantime (conclusively not upgraded): the stored photo is removed and the scan is reported as a duplicate', async () => {
    const { store, log } = fakeStore({ existing: EXISTING, upgrade: { ok: false, inconclusive: false } })
    expect(await run(store, data({ doc_type: 'invoice' }))).toEqual({ kind: 'duplicate', existing: EXISTING })
    expect(log).toEqual(['find', 'upload', 'upgrade', 'remove:invoices/abc.jpg'])
  })

  it('a database error during the upgrade fails the save and KEEPS the photo — the update may have been committed, so the photo may be the row\'s file', async () => {
    const { store, log } = fakeStore({ existing: EXISTING, upgradeThrows: true })
    expect(await run(store, data({ doc_type: 'invoice' }))).toEqual({ kind: 'failed', stage: 'insert' })
    expect(log).toEqual(['find', 'upload', 'upgrade']) // no remove:…
  })

  it('an inconclusive answer from the store (a database error) also keeps the photo and asks to retry — it is not reported as a duplicate', async () => {
    const { store, log } = fakeStore({ existing: EXISTING, upgrade: { ok: false, inconclusive: true } })
    expect(await run(store, data({ doc_type: 'invoice' }))).toEqual({ kind: 'failed', stage: 'insert' })
    expect(log).toEqual(['find', 'upload', 'upgrade'])
  })
})

// Decision 5: a credit note is STORED negative, so it is LOOKED UP negative — the identity compares signed cents.
describe('a scanned credit note is looked up with its signed total', () => {
  it('a printed (positive) total on a credit note is looked up negative, and stored negative', async () => {
    const seen: { total: number | null }[] = []
    const { store, inserted } = fakeStore()
    const spy: ScanStore = { ...store, async findDuplicate(key) { seen.push({ total: key.total }); return null } }
    await run(spy, data({ doc_type: 'credit_note', total: 1652, pretax: 1400, vat: 252 }))
    expect(seen[0]!.total).toBe(-1652)
    expect(inserted[0]!.total).toBe(-1652)
  })

  it('so a second scan of the same credit note meets the stored (negative) row', async () => {
    const stored: DuplicateInfo = { ...EXISTING, doc_number: '58857', doc_type: 'credit_note', total: -1652 }
    const { store, log } = fakeStore({ existing: stored })
    expect(await run(store, data({ doc_type: 'credit_note', doc_number: '58857', total: 1652, pretax: 1400, vat: 252 }))).toEqual({ kind: 'duplicate', existing: stored })
    expect(log).toEqual(['find'])
  })

  it('an invoice keeps its positive total in the lookup', async () => {
    const seen: (number | null)[] = []
    const { store } = fakeStore()
    await run({ ...store, async findDuplicate(key) { seen.push(key.total); return null } }, data({ doc_type: 'invoice', total: 118, pretax: 100, vat: 18 }))
    expect(seen).toEqual([118])
  })
})
