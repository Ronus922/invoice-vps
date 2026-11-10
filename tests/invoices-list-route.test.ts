import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fake, type Row } from './fake-postgrest'

// GET /api/invoices must hand back EVERY invoice. The shared PostgREST cuts any response at 1000 rows without
// an error, and at 1057 rows the home page lost the 57 oldest invoices (2026-11-10). The fake database in
// tests/fake-postgrest.ts has that cap, so a GET that goes back to ONE plain query fails these tests.

const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }))

vi.mock('@supabase/supabase-js', async () => {
  const { fakeClient } = await import('./fake-postgrest')
  return { createClient: () => fakeClient }
})
vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: async () => auth.user,
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
}))

import { GET } from '@/app/api/invoices/route'

const VENDORS = ['רמי לוי', 'מי כרמל', 'חברת חשמל', 'פז']

function table(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${String(i).padStart(5, '0')}`,
    created_at: new Date(Date.UTC(2026, 2, 1) + i * 60_000).toISOString(), // oldest = i 0
    vendor: VENDORS[i % VENDORS.length]!, // heavy ties for sort=vendor
    source: i % 3 === 0 ? 'gmail' : 'folder', // heavier ties for sort=source
    total: i,
  }))
}

const get = (query = '') => GET(new NextRequest(`http://localhost/api/invoices${query}`))
const ids = async (res: Response) => ((await res.json()) as Array<{ id: string }>).map((r) => r.id)

beforeEach(() => {
  fake.reset({ invoices: table(2500) })
  auth.user = { id: 'u1' }
})

describe('GET /api/invoices', () => {
  it('returns all rows when the table is larger than the 1000-row server cap', async () => {
    const res = await get('?sort=-created_at') // what the home page sends
    expect(res.status).toBe(200)
    const out = await ids(res)
    expect(out).toHaveLength(2500)
    expect(new Set(out).size).toBe(2500)
  })

  it('keeps the OLDEST rows (the ones the single query used to drop) when sorting newest-first', async () => {
    const out = await ids(await get('?sort=-created_at'))
    expect(out[0]).toBe('id-02499') // newest first
    expect(out.at(-1)).toBe('id-00000') // oldest invoice is still there
  })

  it('returns exactly the 1057 rows of the production incident, oldest 57 included', async () => {
    fake.reset({ invoices: table(1057) })
    const out = await ids(await get('?sort=-created_at'))
    expect(out).toHaveLength(1057)
    expect(out.slice(-57)).toContain('id-00000')
  })

  it('returns each row exactly once when sorting by a column most rows share (vendor, source)', async () => {
    for (const sort of ['vendor', '-vendor', 'source', '-source']) {
      const out = await ids(await get(`?sort=${sort}`))
      expect(out, sort).toHaveLength(2500)
      expect(new Set(out).size, sort).toBe(2500)
    }
  })

  it('orders correctly across page boundaries', async () => {
    const asc = (await (await get('?sort=total')).json()) as Array<{ total: number }>
    expect(asc.map((r) => r.total)).toEqual(Array.from({ length: 2500 }, (_, i) => i))
    const desc = (await (await get('?sort=-total')).json()) as Array<{ total: number }>
    expect(desc.map((r) => r.total)).toEqual(Array.from({ length: 2500 }, (_, i) => 2499 - i))
  })

  it('does not return a row twice when one is inserted while the pages are being read', async () => {
    fake.afterRequest = (n) => {
      if (n === 1) fake.tables.get('invoices')!.push({ id: 'id-99999', created_at: '2099-01-01T00:00:00.000Z', vendor: 'x', source: 'manual', total: 1 })
    }
    const out = await ids(await get('?sort=-created_at'))
    expect(new Set(out).size).toBe(out.length)
    expect(out).toHaveLength(2500) // the row inserted after page 1 was cut is picked up by the next load
  })

  it('answers an empty list for an empty table', async () => {
    fake.reset({ invoices: [] })
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('answers 500 with the Hebrew message (and no partial list) when a page fails', async () => {
    fake.failOnRequest = 2
    const res = await get('?sort=-created_at')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'טעינת החשבוניות נכשלה' })
  })

  it('answers 401 and reads nothing without a session', async () => {
    auth.user = null
    const res = await get()
    expect(res.status).toBe(401)
    expect(fake.calls).toHaveLength(0)
  })

  it('falls back to created_at for an unknown sort field and never sorts by it', async () => {
    await get('?sort=-password')
    expect(fake.calls.every((c) => c.orders[0] === 'created_at')).toBe(true)
  })

  it('always ends the ORDER BY in the unique id column, so pages cannot repeat or skip rows', async () => {
    await get('?sort=vendor')
    expect(fake.calls.length).toBeGreaterThan(1)
    expect(fake.calls.every((c) => c.orders.at(-1) === 'id')).toBe(true)
  })
})
