import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fake } from './fake-postgrest'

// POST /api/upload/discard — behind the login; removes only a fresh upload that no row points at.

const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }))
vi.mock('@supabase/supabase-js', async () => {
  const { fakeClient } = await import('./fake-postgrest')
  return { createClient: () => fakeClient }
})
vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: async () => auth.user,
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
}))

import { POST } from '@/app/api/upload/discard/route'

const UUID = 'ec4bfa54-f75c-4ab6-82c0-903883aeaf14'
const URL_OF = (p: string) => `https://db.example/storage/v1/object/public/invoice-files/${p}`
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/upload/discard', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }))

beforeEach(() => {
  fake.reset({ invoices: [] })
  auth.user = { id: 'u1' }
})

describe('POST /api/upload/discard', () => {
  it('removes an upload no row points at', async () => {
    const res = await post({ file_url: URL_OF(`invoices/${UUID}.pdf`) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ result: 'removed' })
    expect(fake.removedObjects).toEqual([`invoices/${UUID}.pdf`])
  })

  it('keeps an object a row points at, and anything that is not a fresh upload — and says so', async () => {
    fake.reset({ invoices: [{ id: 'r1', file_url: URL_OF(`invoices/${UUID}.pdf`) }] })
    expect(await (await post({ file_url: URL_OF(`invoices/${UUID}.pdf`) })).json()).toEqual({ result: 'referenced' })
    expect(await (await post({ file_url: URL_OF('invoices/gmail_1_67016238-4620-4d84-b32d-caa951820a5e.jpg') })).json()).toEqual({ result: 'not_an_upload' })
    expect(fake.removedObjects).toEqual([])
  })

  it('is idempotent: asking twice for the same object is not an error', async () => {
    expect((await post({ file_url: URL_OF(`invoices/${UUID}.pdf`) })).status).toBe(200)
    fake.missingObjects = [`${UUID}.pdf`]
    const again = await post({ file_url: URL_OF(`invoices/${UUID}.pdf`) })
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ result: 'not_found' })
  })

  it('refuses to remove an object that is not fresh, even when no row points at it', async () => {
    fake.objectAgeMs = 3 * 24 * 60 * 60 * 1000
    expect(await (await post({ file_url: URL_OF(`invoices/${UUID}.pdf`) })).json()).toEqual({ result: 'too_old' })
    expect(fake.removedObjects).toEqual([])
  })

  it('stays behind the login and touches nothing without it', async () => {
    auth.user = null
    expect((await post({ file_url: URL_OF(`invoices/${UUID}.pdf`) })).status).toBe(401)
    expect(fake.removedObjects).toEqual([])
    expect(fake.requests).toBe(0)
  })

  it('refuses a malformed body', async () => {
    for (const body of ['nope', {}, { file_url: '' }, { file_url: 42 }, { file_url: 'x'.repeat(3000) }]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400)
    }
  })
})
