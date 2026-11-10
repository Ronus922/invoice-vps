import { beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findDuplicateDocument } from '@/lib/find-duplicate-document'
import { findDuplicateIn } from '@/lib/scan/store'
import { fake, fakeClient, MAX_ROWS, type Row } from './fake-postgrest'

// The database side of the identity check. The fake PostgREST has the shared server's 1000-row cap and an
// unstable tie order; its `.eq()` only records (the identity is decided in code), so the tests feed it the
// rows the real database would return for the total, plus other rows it would not — which must not match.

const db = fakeClient as unknown as Pick<SupabaseClient, 'from'>

// The rows of 2026-11-09/10 (real values): the receipt scanned from the phone, then the same receipt as a folder PDF.
const SCANNED: Row = {
  id: 'scan-row-0001', vendor: 'MAX סטוק ביג מקס קריח חיים', doc_number: '1011014259', doc_type: 'invoice_receipt',
  date: '08/11/2026', total: 155.7, currency: 'ILS', source: 'scan', created_at: '2026-11-09T17:45:00Z', vendor_tax_id: null,
}

function row(over: Partial<Row>): Row {
  return { ...SCANNED, ...over } as Row
}

describe('findDuplicateDocument', () => {
  beforeEach(() => fake.reset())

  it('MAX / "ביג מקס" 1011014259 of 08/11/2026, 155.70 ₪: the folder PDF is the same document as the phone scan, whatever the vendor spelling', async () => {
    fake.reset({ invoices: [SCANNED] })
    const fromFolder = { vendor: 'מקס סטוק - אדמירלטי חלוצי התעשייה', doc_number: '1011014259', date: '08/11/2026', total: 155.7, doc_type: 'invoice_receipt' }
    const hit = await findDuplicateDocument(db, fromFolder)
    expect(hit).toMatchObject({ id: SCANNED.id, vendor: 'MAX סטוק ביג מקס קריח חיים' })
  })

  it('asks the database for the total only (a half-cent window), then decides in code', async () => {
    fake.reset({ invoices: [SCANNED] })
    await findDuplicateDocument(db, { doc_number: '1011014259', date: '08/11/2026', total: '155.70' })
    expect(fake.calls[0]).toMatchObject({ table: 'invoices', filters: ['total>=155.695', 'total<155.705'] })
  })

  it('matches a number written with zeros, spaces or hyphens, and a date in the form format', async () => {
    fake.reset({ invoices: [row({ doc_number: '00570106008278', date: '01/03/2026', total: 61.1 })] })
    expect(await findDuplicateDocument(db, { doc_number: '0057-0106 008278', date: '2026-03-01', total: 61.1 })).not.toBeNull()
  })

  it('is not fooled by other rows with the same total', async () => {
    fake.reset({
      invoices: [
        row({ id: 'a', doc_number: '1011014260' }), // another number
        row({ id: 'b', date: '09/11/2026' }), // another day
        row({ id: 'c', vendor_tax_id: '512345678' }), // another issuer
      ],
    })
    expect(await findDuplicateDocument(db, { doc_number: '1011014259', date: '08/11/2026', total: 155.7, vendor_tax_id: '999999999' })).toBeNull()
  })

  it('the tax id is compared only when both sides have one', async () => {
    fake.reset({ invoices: [row({ vendor_tax_id: '512345678' })] })
    expect(await findDuplicateDocument(db, { doc_number: '1011014259', date: '08/11/2026', total: 155.7, vendor_tax_id: '' })).not.toBeNull()
    expect(await findDuplicateDocument(db, { doc_number: '1011014259', date: '08/11/2026', total: 155.7, vendor_tax_id: '51-2345678' })).not.toBeNull()
  })

  it('no number or no total: no identity, nothing is queried', async () => {
    fake.reset({ invoices: [SCANNED] })
    expect(await findDuplicateDocument(db, { doc_number: '', date: '08/11/2026', total: 155.7 })).toBeNull()
    expect(await findDuplicateDocument(db, { doc_number: '1011014259', date: '08/11/2026', total: 0 })).toBeNull()
    expect(await findDuplicateDocument(db, { doc_number: '1011014259', date: '08/11/2026', total: null })).toBeNull()
    expect(fake.calls).toHaveLength(0)
  })

  it('returns the earliest of several copies', async () => {
    fake.reset({ invoices: [row({ id: 'late', created_at: '2026-11-10T08:45:00Z' }), row({ id: 'early', created_at: '2026-11-09T17:45:00Z' })] })
    expect((await findDuplicateDocument(db, { doc_number: '1011014259', date: '08/11/2026', total: 155.7 }))?.id).toBe('early')
  })

  it('sees a duplicate that sits beyond the first 1000 rows of the same total (the shared PostgREST cuts a response at 1000)', async () => {
    const fillers = Array.from({ length: MAX_ROWS + 50 }, (_, i) =>
      row({ id: `f-${String(i).padStart(5, '0')}`, doc_number: `F${i}`, created_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() }),
    )
    fake.reset({ invoices: [...fillers, row({ id: 'the-copy', created_at: '2026-11-01T00:00:00Z' })] })
    expect((await findDuplicateDocument(db, { doc_number: '1011014259', date: '08/11/2026', total: 155.7 }))?.id).toBe('the-copy')
  })

  it('a database error is thrown — "could not look" is not "no duplicate"', async () => {
    fake.reset({ invoices: [SCANNED] })
    fake.failOnRequest = 1
    await expect(findDuplicateDocument(db, { doc_number: '1011014259', date: '08/11/2026', total: 155.7 })).rejects.toThrow('duplicate_lookup_failed')
  })
})

describe('findDuplicateIn — the phone scan (and its early warning) ask the same question', () => {
  beforeEach(() => fake.reset())

  it('by number, the form date (YYYY-MM-DD), the total and the tax id — not by vendor or doc type', async () => {
    fake.reset({ invoices: [SCANNED] })
    const hit = await findDuplicateIn(db as SupabaseClient, { docNumber: '1011014259', date: '2026-11-08', total: 155.7, vendorTaxId: null })
    expect(hit).toMatchObject({ id: SCANNED.id })
  })
  it('a key without a total has no identity', async () => {
    fake.reset({ invoices: [SCANNED] })
    expect(await findDuplicateIn(db as SupabaseClient, { docNumber: '1011014259', date: '2026-11-08', total: null, vendorTaxId: null })).toBeNull()
  })
})
