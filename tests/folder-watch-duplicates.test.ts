import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Invoice } from '@/lib/entities'

// Decision 2 (2026-11-10): the folder scan deletes a duplicate's source file as before — but only AFTER the server has
// confirmed that the row it duplicates exists and that row's file is in Storage. Anything it cannot confirm leaves the
// file in the folder. Decision 1 is checked here too: a tax invoice over a stored receipt is not skipped by the
// browser's pre-check — it goes to the server, which upgrades that row.

vi.mock('@/lib/upload', () => ({
  uploadFile: vi.fn(async (f: File) => `https://x/storage/v1/object/public/invoice-files/invoices/${f.name}`),
}))
vi.mock('@/lib/vendor-category-memory', () => ({ applyRememberedCategory: (x: unknown) => x, rememberVendorCategory: vi.fn() }))

import { runFolderScan, verifyExistingDocument } from '@/lib/folder-watch'

const STORED = (over: Partial<Invoice> = {}): Invoice =>
  ({
    id: '11111111-1111-4111-8111-111111111111', vendor: 'MAX', doc_number: '1011014259', doc_type: 'invoice_receipt', date: '08/11/2026',
    total: 155.7, currency: 'ILS', vendor_tax_id: null, ...over,
  }) as Invoice

const EXTRACTED = { vendor: 'מקס סטוק', doc_number: '1011014259', doc_type: 'invoice_receipt', date: '08/11/2026', total: 155.7, currency: 'ILS', pretax: 131.95, vat: 23.75 }

type Scenario = {
  extracted?: Record<string, unknown>
  /** Answer of POST /api/invoices. */
  created?: Record<string, unknown>
  /** Answer of GET /api/invoices/verify, or 'network' / a status code. */
  verify?: { ok: boolean; reason?: string } | 'network' | number
}

function setup(scenario: Scenario) {
  const calls: { url: string; method: string; body?: unknown }[] = []
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    if (url.startsWith('/api/extract-invoice')) return json(scenario.extracted ?? EXTRACTED)
    if (url.startsWith('/api/invoices/verify')) {
      if (scenario.verify === 'network') throw new TypeError('network down')
      if (typeof scenario.verify === 'number') return json({ error: 'x' }, scenario.verify)
      return json(scenario.verify ?? { ok: true })
    }
    if (url === '/api/invoices') return json(scenario.created ?? { id: 'new-row', needs_review: true })
    if (url.startsWith('/api/send-to-accountant')) return json({ sent: true })
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetchStub)

  const removed: string[] = []
  const handle = {
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    async *values() {
      yield { kind: 'file', name: 'scan.pdf', getFile: async () => new File(['%PDF'], 'scan.pdf') }
    },
    removeEntry: async (name: string) => {
      removed.push(name)
    },
  } as unknown as FileSystemDirectoryHandle
  const verifyCalls = () => calls.filter((c) => c.url.startsWith('/api/invoices/verify'))
  const posts = () => calls.filter((c) => c.url === '/api/invoices' && c.method === 'POST')
  return { handle, removed, calls, verifyCalls, posts }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('folder scan — a duplicate\'s source file is deleted only after the existing row and its file are confirmed', () => {
  it('pre-check duplicate, existing row confirmed: the source file is removed, and the server is asked about THAT row', async () => {
    const t = setup({ verify: { ok: true } })
    const res = await runFolderScan(t.handle, [STORED()], undefined)
    expect(res).toMatchObject({ total: 1, created: 0, duplicates: 1, errors: 0 })
    expect(t.removed).toEqual(['scan.pdf'])
    expect(t.verifyCalls().map((c) => c.url)).toEqual(['/api/invoices/verify?id=11111111-1111-4111-8111-111111111111'])
    expect(t.posts()).toHaveLength(0) // the pre-check stopped it: nothing was sent to the server
  })

  it('pre-check duplicate but the existing row / its file is NOT confirmed: the source file stays in the folder and the run reports it', async () => {
    const t = setup({ verify: { ok: false, reason: 'file_missing' } })
    const res = await runFolderScan(t.handle, [STORED()], undefined)
    expect(t.removed).toEqual([])
    expect(res).toMatchObject({ duplicates: 1, errors: 1 })
    expect(res!.errorMessages[0]).toMatch(/scan\.pdf.*לא אומתה.*נשאר בתיקייה/)
  })

  it('the verification request fails (network error, or a non-200 answer): the source file stays', async () => {
    for (const verify of ['network', 500, 401] as const) {
      const t = setup({ verify })
      const res = await runFolderScan(t.handle, [STORED()], undefined)
      expect(t.removed, String(verify)).toEqual([])
      expect(res!.errors, String(verify)).toBe(1)
    }
  })

  it('the server reports the duplicate (the snapshot missed it) and names the row: confirmed, then the source file is removed', async () => {
    const t = setup({ created: { duplicate: true, existing_id: '22222222-2222-4222-8222-222222222222' }, verify: { ok: true } })
    const res = await runFolderScan(t.handle, [], undefined)
    expect(res).toMatchObject({ created: 0, duplicates: 1, errors: 0 })
    expect(t.removed).toEqual(['scan.pdf'])
    expect(t.verifyCalls().map((c) => c.url)).toEqual(['/api/invoices/verify?id=22222222-2222-4222-8222-222222222222'])
  })

  it('the server reports a duplicate but cannot name the row (unique-index hit): nothing to confirm, so the source file stays — and no verify request is made', async () => {
    const t = setup({ created: { duplicate: true } })
    const res = await runFolderScan(t.handle, [], undefined)
    expect(t.removed).toEqual([])
    expect(t.verifyCalls()).toHaveLength(0)
    expect(res).toMatchObject({ duplicates: 1, errors: 1 })
  })

  it('the server named a row that is not confirmed: the source file stays', async () => {
    const t = setup({ created: { duplicate: true, existing_id: '22222222-2222-4222-8222-222222222222' }, verify: { ok: false, reason: 'not_found' } })
    const res = await runFolderScan(t.handle, [], undefined)
    expect(t.removed).toEqual([])
    expect(res!.errors).toBe(1)
  })

  it('a file that creates a new row is removed exactly as before, with no verification involved', async () => {
    const t = setup({ extracted: { ...EXTRACTED, doc_number: '777' }, created: { id: 'new-row', needs_review: false } })
    const res = await runFolderScan(t.handle, [STORED()], undefined)
    expect(res).toMatchObject({ created: 1, duplicates: 0, errors: 0 })
    expect(t.removed).toEqual(['scan.pdf'])
    expect(t.verifyCalls()).toHaveLength(0)
  })
})

describe('folder scan — Decision 1: a tax invoice over a stored receipt goes to the server (which upgrades the row)', () => {
  it('invoice over a stored RECEIPT: the pre-check does not skip it — it is sent, and a confirmed upgrade removes the source file', async () => {
    const t = setup({
      extracted: { ...EXTRACTED, doc_type: 'invoice' },
      created: { duplicate: true, upgraded: true, existing_id: '11111111-1111-4111-8111-111111111111' },
      verify: { ok: true },
    })
    const res = await runFolderScan(t.handle, [STORED({ doc_type: 'receipt' })], undefined)
    expect(t.posts()).toHaveLength(1) // not stopped by the pre-check
    expect(t.posts()[0]!.body).toMatchObject({ doc_type: 'invoice', file_url: expect.stringContaining('scan.pdf') })
    expect(res).toMatchObject({ created: 0, duplicates: 1, errors: 0 })
    expect(t.removed).toEqual(['scan.pdf'])
  })

  it('an upgrade that cannot be confirmed leaves the source file in the folder', async () => {
    const t = setup({
      extracted: { ...EXTRACTED, doc_type: 'invoice_receipt' },
      created: { duplicate: true, upgraded: true, existing_id: '11111111-1111-4111-8111-111111111111' },
      verify: { ok: false, reason: 'file_missing' },
    })
    await runFolderScan(t.handle, [STORED({ doc_type: 'receipt' })], undefined)
    expect(t.removed).toEqual([])
  })

  it('a RECEIPT over a stored tax invoice is skipped by the pre-check (a plain duplicate), after confirmation', async () => {
    const t = setup({ extracted: { ...EXTRACTED, doc_type: 'receipt' }, verify: { ok: true } })
    const res = await runFolderScan(t.handle, [STORED({ doc_type: 'invoice' })], undefined)
    expect(t.posts()).toHaveLength(0)
    expect(res).toMatchObject({ duplicates: 1, errors: 0 })
    expect(t.removed).toEqual(['scan.pdf'])
  })
})

describe('verifyExistingDocument', () => {
  const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it('no id: nothing to confirm — false, and no request is made', async () => {
    const f = answer({ ok: true })
    expect(await verifyExistingDocument(undefined, f)).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('true only for an explicit { ok: true }', async () => {
    expect(await verifyExistingDocument('id-1', answer({ ok: true }))).toBe(true)
    expect(await verifyExistingDocument('id-1', answer({ ok: false, reason: 'not_found' }))).toBe(false)
    expect(await verifyExistingDocument('id-1', answer({}))).toBe(false)
    expect(await verifyExistingDocument('id-1', answer({ ok: 'yes' }))).toBe(false)
    expect(await verifyExistingDocument('id-1', answer({ ok: true }, 500))).toBe(false)
    expect(await verifyExistingDocument('id-1', vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBe(false)
  })

  it('asks about the row by id only (url-encoded)', async () => {
    const f = answer({ ok: true })
    await verifyExistingDocument('a b/c', f)
    expect(f).toHaveBeenCalledWith('/api/invoices/verify?id=a%20b%2Fc', { credentials: 'include' })
  })
})
