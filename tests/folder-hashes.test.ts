import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { sha256Hex } from '@/lib/file-hash'
import { SHA256_HEX, findKnownHashes, recordUnverifiedHash } from '@/lib/folder-hashes'
import { discardUploadedFile } from '@/lib/upload'

// The memory of folder files that were recognised as duplicates but could not be confirmed (owner's decision, 2026-11-11):
// the hash lib, the two routes behind the login, and the browser helper for discarding an upload.

const H1 = 'a'.repeat(64)
const H2 = 'b'.repeat(64)
const ID = '33333333-3333-4333-8333-333333333333'

const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }))
const store = vi.hoisted(() => ({
  rows: [] as { sha256: string; existing_id: string | null; reason: string }[],
  upserts: [] as Record<string, unknown>[],
  upsertOptions: [] as unknown[],
  selectError: null as { code?: string } | null,
  upsertError: null as { code?: string } | null,
  inCalls: [] as unknown[][],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== 'folder_duplicate_hashes') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          in: async (_col: string, values: string[]) => {
            store.inCalls.push(values)
            return store.selectError ? { data: null, error: store.selectError } : { data: store.rows.filter((r) => values.includes(r.sha256)), error: null }
          },
        }),
        upsert: async (row: Record<string, unknown>, options: unknown) => {
          store.upserts.push(row)
          store.upsertOptions.push(options)
          return { error: store.upsertError }
        },
      }
    },
  }),
}))
vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: async () => auth.user,
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
}))

import { POST as checkPost } from '@/app/api/folder-hashes/check/route'
import { POST as recordPost } from '@/app/api/folder-hashes/route'

const req = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  store.rows = []
  store.upserts = []
  store.upsertOptions = []
  store.selectError = null
  store.upsertError = null
  store.inCalls = []
  auth.user = { id: 'u1' }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('sha256Hex', () => {
  it('is the SHA-256 of the bytes, 64 lowercase hex characters (known vectors)', async () => {
    expect(await sha256Hex(new Blob([''])) ).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256Hex(new Blob(['abc']))).toMatch(SHA256_HEX)
  })

  it('depends on the bytes only: the same content under another name hashes the same, other content does not', async () => {
    const a = await sha256Hex(new File(['%PDF-1'], 'a.pdf'))
    expect(await sha256Hex(new File(['%PDF-1'], 'b.pdf'))).toBe(a)
    expect(await sha256Hex(new File(['%PDF-2'], 'a.pdf'))).not.toBe(a)
  })
})

describe('findKnownHashes / recordUnverifiedHash', () => {
  const createClient = async () => (await import('@supabase/supabase-js')).createClient('x', 'y')

  it('returns only the remembered hashes among those asked, asking once with the distinct valid ones', async () => {
    store.rows = [{ sha256: H1, existing_id: ID, reason: 'unverified_duplicate' }]
    const known = await findKnownHashes(await createClient(), [H1, H2, H1, 'not-a-hash'])
    expect(known).toEqual([{ sha256: H1, existing_id: ID, reason: 'unverified_duplicate' }])
    expect(store.inCalls).toEqual([[H1, H2]])
  })

  it('asks nothing when no valid hash is given', async () => {
    expect(await findKnownHashes(await createClient(), ['x', ''])).toEqual([])
    expect(store.inCalls).toEqual([])
  })

  it('a database error is thrown — "could not look" is not "unknown file"', async () => {
    store.selectError = { code: 'XX000' }
    await expect(findKnownHashes(await createClient(), [H1])).rejects.toThrow('folder_hash_lookup_failed:XX000')
  })

  it('records by upsert on the hash (idempotent), with the row it duplicates and the reason, refreshing last_seen_at', async () => {
    expect(await recordUnverifiedHash(await createClient(), { sha256: H1, existing_id: ID, reason: 'unverified_duplicate', file_name: 'scan.pdf' })).toBe(true)
    expect(store.upserts[0]).toMatchObject({ sha256: H1, existing_id: ID, reason: 'unverified_duplicate', file_name: 'scan.pdf' })
    expect(typeof store.upserts[0]!.last_seen_at).toBe('string')
    expect(store.upsertOptions[0]).toEqual({ onConflict: 'sha256' })
  })

  it('refuses a malformed hash and reports a failed write', async () => {
    expect(await recordUnverifiedHash(await createClient(), { sha256: 'xyz', existing_id: ID, reason: 'r', file_name: null })).toBe(false)
    expect(store.upserts).toHaveLength(0)
    store.upsertError = { code: 'XX000' }
    expect(await recordUnverifiedHash(await createClient(), { sha256: H1, existing_id: ID, reason: 'r', file_name: null })).toBe(false)
  })
})

describe('POST /api/folder-hashes/check', () => {
  it('answers which hashes are remembered', async () => {
    store.rows = [{ sha256: H1, existing_id: null, reason: 'unverified_duplicate' }]
    const res = await checkPost(req('/api/folder-hashes/check', { hashes: [H1, H2] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ known: [{ sha256: H1, existing_id: null, reason: 'unverified_duplicate' }] })
  })

  it('stays behind the login', async () => {
    auth.user = null
    expect((await checkPost(req('/api/folder-hashes/check', { hashes: [H1] }))).status).toBe(401)
    expect(store.inCalls).toEqual([])
  })

  it('refuses a malformed body: not JSON, no hashes, too many, a non-hash', async () => {
    for (const body of ['not json', {}, { hashes: [] }, { hashes: ['zz'] }, { hashes: Array.from({ length: 51 }, () => H1) }, { hashes: [H1.toUpperCase()] }]) {
      expect((await checkPost(req('/api/folder-hashes/check', body))).status, JSON.stringify(body)).toBe(400)
    }
  })

  it('a database error is a 500, not an empty "nothing known" answer', async () => {
    store.selectError = { code: 'XX000' }
    expect((await checkPost(req('/api/folder-hashes/check', { hashes: [H1] }))).status).toBe(500)
  })
})

describe('POST /api/folder-hashes', () => {
  it('records the hash with the row it duplicates', async () => {
    const res = await recordPost(req('/api/folder-hashes', { sha256: H1, existing_id: ID, file_name: 'scan.pdf', reason: 'unverified_duplicate' }))
    expect(res.status).toBe(200)
    expect(store.upserts[0]).toMatchObject({ sha256: H1, existing_id: ID, file_name: 'scan.pdf', reason: 'unverified_duplicate' })
  })

  it('file_name and reason are optional (the default reason) — the row the file duplicates is NOT: a duplicate nobody could name is never remembered', async () => {
    expect((await recordPost(req('/api/folder-hashes', { sha256: H1, existing_id: ID }))).status).toBe(200)
    expect(store.upserts[0]).toMatchObject({ sha256: H1, existing_id: ID, file_name: null, reason: 'unverified_duplicate' })
    store.upserts = []
    for (const body of [{ sha256: H1 }, { sha256: H1, existing_id: null }]) {
      expect((await recordPost(req('/api/folder-hashes', body))).status, JSON.stringify(body)).toBe(400)
    }
    expect(store.upserts).toHaveLength(0)
  })

  it('stays behind the login and writes nothing without it', async () => {
    auth.user = null
    expect((await recordPost(req('/api/folder-hashes', { sha256: H1, existing_id: ID }))).status).toBe(401)
    expect(store.upserts).toHaveLength(0)
  })

  it('refuses a malformed body: a bad hash, a bad row id, an over-long name', async () => {
    for (const body of ['nope', {}, { sha256: 'abc', existing_id: ID }, { sha256: H1, existing_id: 'not-a-uuid' }, { sha256: H1, existing_id: ID, file_name: 'x'.repeat(301) }]) {
      expect((await recordPost(req('/api/folder-hashes', body))).status, JSON.stringify(body)).toBe(400)
    }
    expect(store.upserts).toHaveLength(0)
  })

  it('a failed write is a 500', async () => {
    store.upsertError = { code: 'XX000' }
    expect((await recordPost(req('/api/folder-hashes', { sha256: H1, existing_id: ID }))).status).toBe(500)
  })
})

describe('discardUploadedFile (the browser helper)', () => {
  it('asks the server to discard the uploaded object — by its URL, nothing else', async () => {
    const f = vi.fn(async () => new Response('{}'))
    await discardUploadedFile('https://x/storage/v1/object/public/invoice-files/invoices/a.pdf', f as unknown as typeof fetch)
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/upload/discard')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/a.pdf' })
  })

  it('with no URL it does nothing, and a failing request never throws', async () => {
    const f = vi.fn(async () => new Response('{}'))
    await discardUploadedFile(null, f as unknown as typeof fetch)
    await discardUploadedFile(undefined, f as unknown as typeof fetch)
    await discardUploadedFile('', f as unknown as typeof fetch)
    expect(f).not.toHaveBeenCalled()
    await expect(discardUploadedFile('u', (async () => { throw new TypeError('down') }) as unknown as typeof fetch)).resolves.toBeUndefined()
  })
})
