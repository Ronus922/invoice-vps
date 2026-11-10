import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fake, type Row } from './fake-postgrest'

// POST /api/invoices is the road of the manual upload, the folder scan and every other client insert. It must
// refuse a row that is the SAME DOCUMENT as one already stored — normalised doc_number + date + total (+ the
// vendor's tax id when both sides have one) — whatever the vendor's spelling or the doc type; the answer is the
// one the unique index always gave: 200 { duplicate: true } and no row.

const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }))

vi.mock('@supabase/supabase-js', async () => {
  const { fakeClient } = await import('./fake-postgrest')
  return { createClient: () => fakeClient }
})
vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: async () => auth.user,
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
}))

import { POST } from '@/app/api/invoices/route'

// The phone scan of 2026-11-09 17:45 as it is in the table.
const SCANNED: Row = {
  id: 'scan-row-0001', vendor: 'MAX סטוק ביג מקס קריח חיים', doc_number: '1011014259', doc_type: 'invoice_receipt', date: '08/11/2026',
  total: 155.7, currency: 'ILS', source: 'scan', created_at: '2026-11-09T17:45:00Z', vendor_tax_id: null, category: 'אחר',
}

const post = (body: Record<string, unknown>) =>
  POST(new NextRequest('http://localhost/api/invoices', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }))

// What the folder scan sends for the same receipt: another vendor spelling, the same number, date and total.
const FROM_FOLDER = {
  vendor: 'מקס סטוק - אדמירלטי חלוצי התעשייה', doc_number: '1011014259', doc_type: 'invoice_receipt', date: '08/11/2026',
  pretax: 131.95, vat: 23.75, total: 155.7, currency: 'ILS', source: 'folder', file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/a.pdf', file_name: 'a.pdf',
}

describe('POST /api/invoices — the same document is not stored twice', () => {
  beforeEach(() => {
    fake.reset({ invoices: [SCANNED] })
    auth.user = { id: 'u1' }
  })

  it('MAX / "ביג מקס" 1011014259 of 08/11/2026, 155.70 ₪: the folder PDF is refused as a duplicate — 200, no row', async () => {
    const res = await post(FROM_FOLDER)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ duplicate: true, existing_id: 'scan-row-0001' })
    expect(fake.inserted).toHaveLength(0)
  })

  it('the doc type is not part of the identity (the old scan read it as "unknown")', async () => {
    const res = await post({ ...FROM_FOLDER, doc_type: 'unknown' })
    expect(await res.json()).toEqual({ duplicate: true, existing_id: 'scan-row-0001' })
    expect(fake.inserted).toHaveLength(0)
  })

  it('a number written with zeros, spaces or hyphens, and an ISO date, is still the same document', async () => {
    const res = await post({ ...FROM_FOLDER, doc_number: '00 1011-014259', date: '2026-11-08' })
    expect(await res.json()).toEqual({ duplicate: true, existing_id: 'scan-row-0001' })
  })

  it('a different total, number or day is a different document: it is stored', async () => {
    for (const over of [{ total: 155.8 }, { doc_number: '1011014260' }, { date: '09/11/2026' }]) {
      fake.reset({ invoices: [SCANNED] })
      const res = await post({ ...FROM_FOLDER, ...over })
      const body = (await res.json()) as Record<string, unknown>
      expect(body.duplicate).toBeUndefined()
      expect(fake.inserted).toHaveLength(1)
    }
  })

  it('a row with no total has no identity: it is stored (flagged for review), as before', async () => {
    const res = await post({ ...FROM_FOLDER, total: null })
    expect(((await res.json()) as Record<string, unknown>).duplicate).toBeUndefined()
    expect(fake.inserted).toHaveLength(1)
  })

  it('a failing lookup does not block the insert — the unique index is the net', async () => {
    fake.failOnRequest = 1 // the lookup is the first request
    const res = await post({ ...FROM_FOLDER, doc_number: '777' })
    expect(((await res.json()) as Record<string, unknown>).duplicate).toBeUndefined()
    expect(fake.inserted).toHaveLength(1)
  })

  it('a unique-index hit at the insert (a race the lookup could not see) is still reported as a duplicate', async () => {
    fake.reset({ invoices: [] })
    fake.insertError = { message: 'duplicate key', code: '23505' }
    const res = await post(FROM_FOLDER)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ duplicate: true })
  })

  it('stays behind the login', async () => {
    auth.user = null
    expect((await post(FROM_FOLDER)).status).toBe(401)
    expect(fake.calls).toHaveLength(0)
  })
})

// The unique-index race still answers 'duplicate' — and names the row when the identity finds it, so the folder scan can
// confirm that row (Decision 2) before it deletes its source file.
describe('POST /api/invoices — existing_id on a race', () => {
  beforeEach(() => {
    fake.reset({ invoices: [SCANNED] })
    auth.user = { id: 'u1' }
  })

  it('the lookup failed, then the unique index fired: the answer still names the existing row', async () => {
    fake.failOnRequest = 1
    fake.insertError = { message: 'duplicate key', code: '23505' }
    const res = await post(FROM_FOLDER)
    expect(await res.json()).toEqual({ duplicate: true, existing_id: 'scan-row-0001' })
  })

  it('when no row can be named there is no existing_id — the caller then keeps its source file', async () => {
    fake.reset({ invoices: [] })
    fake.insertError = { message: 'duplicate key', code: '23505' }
    expect(await (await post(FROM_FOLDER)).json()).toEqual({ duplicate: true })
  })
})

// Decision 1 (2026-11-10): invoice + receipt of one transaction are ONE document. A tax invoice over a stored RECEIPT
// replaces that row's file and doc_type (no second row); a receipt over a tax invoice is a plain duplicate.
describe('POST /api/invoices — a tax invoice upgrades a stored receipt', () => {
  const RECEIPT_ROW: Row = {
    id: 'receipt-row-01', vendor: 'Anthropic, PBC', doc_number: '1OGZD2JL-0009', doc_type: 'receipt', date: '04/06/2026',
    total: 100, currency: 'USD', source: 'folder', created_at: '2026-06-05T10:00:00Z', vendor_tax_id: null,
    file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/receipt.pdf', file_name: 'Receipt-2208-6059-2757.pdf',
  }
  const INVOICE_IN = {
    vendor: 'Anthropic, PBC', doc_number: '1OGZD2JL-0009', doc_type: 'invoice', date: '04/06/2026', total: 100, currency: 'USD',
    source: 'folder', file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/invoice.pdf', file_name: 'Invoice-1OGZD2JL-0009.pdf',
  }

  beforeEach(() => {
    fake.reset({ invoices: [{ ...RECEIPT_ROW }] })
    auth.user = { id: 'u1' }
  })

  it('invoice over receipt: 200 { duplicate, upgraded, existing_id }, no new row, the stored row takes the invoice file and type', async () => {
    const res = await post(INVOICE_IN)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ duplicate: true, upgraded: true, existing_id: 'receipt-row-01' })
    expect(fake.inserted).toHaveLength(0)
    expect(fake.updates).toHaveLength(1)
    expect(fake.updates[0]!.values).toMatchObject({ file_url: INVOICE_IN.file_url, file_name: 'Invoice-1OGZD2JL-0009.pdf', doc_type: 'invoice' })
    expect(fake.updates[0]!.filters).toEqual(['id=receipt-row-01', 'doc_type=receipt']) // guarded: only while it is still a receipt
    const stored = fake.tables.get('invoices')![0]!
    expect([stored.doc_type, stored.file_url]).toEqual(['invoice', INVOICE_IN.file_url])
  })

  it('nothing else on the stored row changes: vendor, number, date, total, source, sent flags are not in the update', async () => {
    await post(INVOICE_IN)
    expect(Object.keys(fake.updates[0]!.values).sort()).toEqual(['doc_type', 'file_name', 'file_url', 'updated_at'])
  })

  it('a tax invoice/receipt upgrades too', async () => {
    const res = await post({ ...INVOICE_IN, doc_type: 'invoice_receipt' })
    expect(await res.json()).toMatchObject({ upgraded: true })
    expect(fake.tables.get('invoices')![0]!.doc_type).toBe('invoice_receipt')
  })

  it('a receipt over a stored receipt is a plain duplicate — no update', async () => {
    const res = await post({ ...INVOICE_IN, doc_type: 'receipt' })
    expect(await res.json()).toEqual({ duplicate: true, existing_id: 'receipt-row-01' })
    expect(fake.updates).toHaveLength(0)
  })

  it('a receipt over a stored TAX INVOICE is a plain duplicate — the invoice is the document that stays', async () => {
    fake.reset({ invoices: [{ ...RECEIPT_ROW, doc_type: 'invoice' }] })
    const res = await post({ ...INVOICE_IN, doc_type: 'receipt' })
    expect(await res.json()).toEqual({ duplicate: true, existing_id: 'receipt-row-01' })
    expect(fake.updates).toHaveLength(0)
  })

  it('an invoice over an unknown-typed or invoice-typed row is a plain duplicate: only a RECEIPT is replaced', async () => {
    for (const stored of ['unknown', 'invoice', 'invoice_receipt']) {
      fake.reset({ invoices: [{ ...RECEIPT_ROW, doc_type: stored }] })
      const body = (await (await post(INVOICE_IN)).json()) as Record<string, unknown>
      expect(body, stored).toEqual({ duplicate: true, existing_id: 'receipt-row-01' })
      expect(fake.updates, stored).toHaveLength(0)
    }
  })

  it('no file on the incoming document: nothing to put in the row\'s place — a duplicate that names no row (the caller keeps what it has)', async () => {
    const { file_url: _f, file_name: _n, ...noFile } = INVOICE_IN
    void _f; void _n
    const body = await (await post(noFile)).json()
    expect(body).toEqual({ duplicate: true })
    expect(fake.updates).toHaveLength(0)
  })

  it('the unique index rejects the upgrade (another row holds that identity as an invoice): a duplicate that names NO row, so the folder scan keeps its file', async () => {
    fake.updateError = { message: 'duplicate key', code: '23505' }
    const res = await post(INVOICE_IN)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ duplicate: true })
    expect(fake.inserted).toHaveLength(0)
  })

  it('a database error during the upgrade is an ERROR (500), never "duplicate": the outcome is unknown, so the caller keeps its file and retries', async () => {
    fake.updateError = { message: 'connection reset', code: 'XX000' }
    const res = await post(INVOICE_IN)
    expect(res.status).toBe(500)
    expect(((await res.json()) as Record<string, unknown>).duplicate).toBeUndefined()
    expect(fake.inserted).toHaveLength(0)
  })

  it('another TAX INVOICE of the same document already exists beside the receipt: nothing is upgraded — a plain duplicate of the invoice', async () => {
    fake.reset({ invoices: [{ ...RECEIPT_ROW }, { ...RECEIPT_ROW, id: 'invoice-row-02', doc_type: 'invoice', created_at: '2026-06-06T10:00:00Z' }] })
    const body = await (await post(INVOICE_IN)).json()
    expect(body).toEqual({ duplicate: true, existing_id: 'invoice-row-02' })
    expect(fake.updates).toHaveLength(0)
  })
})

// Decision 4: the issuer's tax id (8–9 digits) is read by every path and compared — only when both sides have one.
describe('POST /api/invoices — vendor_tax_id', () => {
  const STORED: Row = {
    id: 'row-with-taxid', vendor: 'MAX', doc_number: '555', doc_type: 'invoice', date: '01/07/2026', total: 50, currency: 'ILS',
    source: 'gmail', created_at: '2026-07-02T10:00:00Z', vendor_tax_id: '515456002',
  }
  const IN = { vendor: 'MAX', doc_number: '555', doc_type: 'invoice', date: '01/07/2026', total: 50, currency: 'ILS', source: 'folder', file_url: 'https://x/a.pdf', file_name: 'a.pdf' }

  beforeEach(() => {
    fake.reset({ invoices: [{ ...STORED }] })
    auth.user = { id: 'u1' }
  })

  it('two different issuers (both tax ids present and different) are two documents, whatever the number/date/total', async () => {
    const res = await post({ ...IN, vendor_tax_id: '514848209' })
    expect(((await res.json()) as Record<string, unknown>).duplicate).toBeUndefined()
    expect(fake.inserted).toHaveLength(1)
    expect(fake.inserted[0]!.vendor_tax_id).toBe('514848209')
  })

  it('the same tax id (written with a hyphen or spaces) is the same issuer: a duplicate', async () => {
    const res = await post({ ...IN, vendor_tax_id: '515-456-002' })
    expect(await res.json()).toEqual({ duplicate: true, existing_id: 'row-with-taxid' })
  })

  it('a missing tax id on one side never separates two documents', async () => {
    expect(((await (await post(IN)).json()) as Record<string, unknown>).duplicate).toBe(true)
    expect(((await (await post({ ...IN, vendor_tax_id: null })).json()) as Record<string, unknown>).duplicate).toBe(true)
  })

  it('a garbled tax id (not 8–9 digits) is stored as null and cannot make the same document look like another issuer', async () => {
    const res = await post({ ...IN, vendor_tax_id: '51-54' })
    expect(((await res.json()) as Record<string, unknown>).duplicate).toBe(true) // still the same document
    fake.reset({ invoices: [] })
    await post({ ...IN, vendor_tax_id: '51-54' })
    expect(fake.inserted[0]!.vendor_tax_id).toBeNull()
  })

  it('a valid tax id is stored normalised to its digits', async () => {
    fake.reset({ invoices: [] })
    await post({ ...IN, vendor_tax_id: 'ח.פ. 51-5456002' })
    expect(fake.inserted[0]!.vendor_tax_id).toBe('515456002')
  })
})

// Decision 5: a credit note is stored with a NEGATIVE total, pre-tax and VAT.
describe('POST /api/invoices — a credit note is stored negative', () => {
  beforeEach(() => {
    fake.reset({ invoices: [] })
    auth.user = { id: 'u1' }
  })

  it('positive amounts on a credit note are stored negative (Reconcept 58857: 1,400 + 252 = 1,652)', async () => {
    await post({ vendor: 'ריקונספט', doc_number: '58857', doc_type: 'credit_note', date: '10/06/2026', pretax: 1400, vat: 252, total: 1652, currency: 'ILS', source: 'folder', file_url: 'https://x/c.pdf', file_name: 'c.pdf' })
    expect(fake.inserted).toHaveLength(1)
    expect([fake.inserted[0]!.pretax, fake.inserted[0]!.vat, fake.inserted[0]!.total]).toEqual([-1400, -252, -1652])
    expect(fake.inserted[0]!.needs_review).toBeUndefined() // the amounts reconcile
  })

  it('a credit note that arrives negative is not flipped back', async () => {
    await post({ vendor: 'חח"י', doc_number: '2026-1', doc_type: 'credit_note', date: '05/11/2026', pretax: -47.05, vat: -8.47, total: -55.52, currency: 'ILS', source: 'folder' })
    expect([fake.inserted[0]!.pretax, fake.inserted[0]!.vat, fake.inserted[0]!.total]).toEqual([-47.05, -8.47, -55.52])
  })

  it('an invoice keeps its positive amounts', async () => {
    await post({ vendor: 'A', doc_number: '7', doc_type: 'invoice', date: '05/11/2026', pretax: 100, vat: 18, total: 118, currency: 'ILS', source: 'folder' })
    expect([fake.inserted[0]!.pretax, fake.inserted[0]!.vat, fake.inserted[0]!.total]).toEqual([100, 18, 118])
  })
})

describe('PATCH /api/invoices — vendor_tax_id is normalised like on POST', () => {
  beforeEach(() => {
    fake.reset({ invoices: [{ id: 'row-1', vendor: 'MAX', doc_number: '5', doc_type: 'invoice', date: '01/07/2026', total: 50, currency: 'ILS', vendor_tax_id: null, created_at: '2026-07-02T10:00:00Z' }] })
    auth.user = { id: 'u1' }
  })
  const patch = async (body: Record<string, unknown>) => {
    const { PATCH } = await import('@/app/api/invoices/route')
    return PATCH(new NextRequest('http://localhost/api/invoices', { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }))
  }

  it('digits only, 8–9 of them: "ח.פ. 51-5456002" is stored as 515456002', async () => {
    await patch({ id: 'row-1', vendor_tax_id: 'ח.פ. 51-5456002' })
    expect(fake.updates[0]!.values.vendor_tax_id).toBe('515456002')
  })

  it('a garbled value (not 8–9 digits) is stored as null', async () => {
    await patch({ id: 'row-1', vendor_tax_id: '12-34' })
    expect(fake.updates[0]!.values.vendor_tax_id).toBeNull()
  })

  it('a PATCH that does not mention the tax id does not touch it', async () => {
    await patch({ id: 'row-1', category: 'אחר' })
    expect('vendor_tax_id' in fake.updates[0]!.values).toBe(false)
  })
})
