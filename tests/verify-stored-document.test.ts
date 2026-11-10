import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { verifyStoredDocument } from '@/lib/verify-stored-document'

// The check behind the folder scan's "delete only after the existing row and its file are confirmed" (Decision 2).

type Listed = { name: string; metadata: { size: number } | null }
interface World {
  row: { id: string; file_url: string | null } | null
  rowError: boolean
  listed: Listed[]
  listError: boolean
}
const world: World = { row: null, rowError: false, listed: [], listError: false }
const listCalls: { folder: string; opts: unknown }[] = []

const db = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => (world.rowError ? { data: null, error: { message: 'boom' } } : { data: world.row, error: null }),
      }),
    }),
  }),
  storage: {
    from: () => ({
      list: async (folder: string, opts: unknown) => {
        listCalls.push({ folder, opts })
        return world.listError ? { data: null, error: { message: 'boom' } } : { data: world.listed, error: null }
      },
    }),
  },
} as unknown as Parameters<typeof verifyStoredDocument>[0]

const URL_OK = 'https://x/storage/v1/object/public/invoice-files/invoices/abc.pdf'

beforeEach(() => {
  world.row = { id: 'r1', file_url: URL_OK }
  world.rowError = false
  world.listed = [{ name: 'abc.pdf', metadata: { size: 1234 } }]
  world.listError = false
  listCalls.length = 0
})

describe('verifyStoredDocument', () => {
  it('the row exists and its object is in the bucket, not empty: confirmed', async () => {
    expect(await verifyStoredDocument(db, 'r1')).toEqual({ ok: true })
    expect(listCalls).toEqual([{ folder: 'invoices', opts: { search: 'abc.pdf', limit: 100 } }])
  })

  it('no such row', async () => {
    world.row = null
    expect(await verifyStoredDocument(db, 'r1')).toEqual({ ok: false, reason: 'not_found' })
  })

  it('a row without a file', async () => {
    world.row = { id: 'r1', file_url: null }
    expect(await verifyStoredDocument(db, 'r1')).toEqual({ ok: false, reason: 'no_file' })
    world.row = { id: 'r1', file_url: '' }
    expect(await verifyStoredDocument(db, 'r1')).toEqual({ ok: false, reason: 'no_file' })
  })

  it('a legacy row whose file is an external URL cannot be confirmed in our bucket', async () => {
    world.row = { id: 'r1', file_url: 'https://base44.app/files/x.pdf' }
    expect(await verifyStoredDocument(db, 'r1')).toEqual({ ok: false, reason: 'external_file' })
    expect(listCalls).toHaveLength(0)
  })

  it('the object is not in the bucket', async () => {
    world.listed = []
    expect(await verifyStoredDocument(db, 'r1')).toEqual({ ok: false, reason: 'file_missing' })
  })

  it('a search hit with another name is not the object (search is a prefix/substring match)', async () => {
    world.listed = [{ name: 'abc.pdf.bak', metadata: { size: 10 } }, { name: 'xabc.pdf', metadata: { size: 10 } }]
    expect(await verifyStoredDocument(db, 'r1')).toEqual({ ok: false, reason: 'file_missing' })
  })

  it('an empty object (0 bytes, or no metadata) does not count', async () => {
    world.listed = [{ name: 'abc.pdf', metadata: { size: 0 } }]
    expect(await verifyStoredDocument(db, 'r1')).toEqual({ ok: false, reason: 'file_missing' })
    world.listed = [{ name: 'abc.pdf', metadata: null }]
    expect(await verifyStoredDocument(db, 'r1')).toEqual({ ok: false, reason: 'file_missing' })
  })

  it('a failed lookup is "could not confirm", never "confirmed"', async () => {
    world.rowError = true
    expect(await verifyStoredDocument(db, 'r1')).toEqual({ ok: false, reason: 'lookup_failed' })
    world.rowError = false
    world.listError = true
    expect(await verifyStoredDocument(db, 'r1')).toEqual({ ok: false, reason: 'lookup_failed' })
  })

  it('a bare object path (no folder) is searched at the bucket root', async () => {
    world.row = { id: 'r1', file_url: 'abc.pdf' }
    await verifyStoredDocument(db, 'r1')
    expect(listCalls[0]).toEqual({ folder: '', opts: { search: 'abc.pdf', limit: 100 } })
  })
})

// ---- the route: login, a uuid only, the answer of the lib ----
const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }))
vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: async () => auth.user,
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db }))

describe('GET /api/invoices/verify', () => {
  const get = async (qs: string) => {
    const { GET } = await import('@/app/api/invoices/verify/route')
    return GET(new NextRequest(`http://localhost/api/invoices/verify${qs}`))
  }
  const ID = '11111111-1111-4111-8111-111111111111'

  beforeEach(() => {
    auth.user = { id: 'u1' }
  })

  it('stays behind the login', async () => {
    auth.user = null
    expect((await get(`?id=${ID}`)).status).toBe(401)
    expect(listCalls).toHaveLength(0)
  })

  it('takes a row id only: a missing, non-uuid or path-like id is a 400 and touches nothing', async () => {
    for (const qs of ['', '?id=', '?id=abc', '?id=../../etc/passwd', `?id=${ID}x`, '?url=https://x/y']) {
      const res = await get(qs)
      expect(res.status, qs).toBe(400)
    }
    expect(listCalls).toHaveLength(0)
  })

  it('answers { ok: true } for a confirmed row and { ok: false, reason } otherwise, never cached', async () => {
    const ok = await get(`?id=${ID}`)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })
    expect(ok.headers.get('Cache-Control')).toBe('private, no-store')
    world.row = null
    expect(await (await get(`?id=${ID}`)).json()).toEqual({ ok: false, reason: 'not_found' })
  })
})
