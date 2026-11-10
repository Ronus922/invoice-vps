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
    expect(await res.json()).toEqual({ duplicate: true })
    expect(fake.inserted).toHaveLength(0)
  })

  it('the doc type is not part of the identity (the old scan read it as "unknown")', async () => {
    const res = await post({ ...FROM_FOLDER, doc_type: 'unknown' })
    expect(await res.json()).toEqual({ duplicate: true })
    expect(fake.inserted).toHaveLength(0)
  })

  it('a number written with zeros, spaces or hyphens, and an ISO date, is still the same document', async () => {
    const res = await post({ ...FROM_FOLDER, doc_number: '00 1011-014259', date: '2026-11-08' })
    expect(await res.json()).toEqual({ duplicate: true })
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
