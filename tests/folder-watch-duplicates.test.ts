import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Invoice } from '@/lib/entities'

// Decision 2 (2026-11-10): the folder scan deletes a duplicate's source file as before — but only AFTER the server has
// confirmed that the row it duplicates exists and that row's file is in Storage. Anything it cannot confirm leaves the
// file in the folder. Decision 1 is checked here too: a tax invoice over a stored receipt is not skipped by the
// browser's pre-check — it goes to the server, which upgrades that row.

const upload = vi.hoisted(() => ({
  uploadFile: vi.fn(async (f: File) => `https://x/storage/v1/object/public/invoice-files/invoices/${f.name}`),
  discardUploadedFile: vi.fn<(url: string | null | undefined) => Promise<void>>(async () => {}),
}))
vi.mock('@/lib/upload', () => upload)
vi.mock('@/lib/vendor-category-memory', () => ({ applyRememberedCategory: (x: unknown) => x, rememberVendorCategory: vi.fn() }))

import { runFolderScan, verifyExistingDocument, lookupKnownHash, rememberUnverifiedDuplicate } from '@/lib/folder-watch'
import { sha256Hex } from '@/lib/file-hash'

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
  /** Answer of POST /api/folder-hashes/check for THIS file's hash: remembered (with the row it duplicates, or null), or a failure. */
  known?: { existing_id: string | null } | 'network' | number
  /** Answer of POST /api/extract-invoice when it fails (status code). */
  extractStatus?: number
}

function setup(scenario: Scenario) {
  const calls: { url: string; method: string; body?: unknown }[] = []
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    if (url.startsWith('/api/extract-invoice')) return scenario.extractStatus ? json({ error: 'חילוץ נכשל' }, scenario.extractStatus) : json(scenario.extracted ?? EXTRACTED)
    if (url === '/api/folder-hashes/check') {
      if (scenario.known === 'network') throw new TypeError('network down')
      if (typeof scenario.known === 'number') return json({ error: 'x' }, scenario.known)
      const hash = (calls[calls.length - 1]!.body as { hashes: string[] }).hashes[0]
      return json({ known: scenario.known ? [{ sha256: hash, existing_id: scenario.known.existing_id, reason: 'unverified_duplicate' }] : [] })
    }
    if (url === '/api/folder-hashes') return json({ ok: true })
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
  const hashPosts = () => calls.filter((c) => c.url === '/api/folder-hashes' && c.method === 'POST')
  const hashChecks = () => calls.filter((c) => c.url === '/api/folder-hashes/check')
  return { handle, removed, calls, verifyCalls, posts, hashPosts, hashChecks }
}

beforeEach(() => {
  vi.unstubAllGlobals()
  upload.uploadFile.mockClear()
  upload.discardUploadedFile.mockClear()
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

// ─── Owner's decision of 2026-11-11 ───────────────────────────────────────────────────────────────────────────────
// 1. A duplicate that could not be confirmed stays in the folder — its SHA-256 is remembered (additive table), and the
//    next scans skip it BEFORE the upload and BEFORE the (billed) extraction.
// 2. A file that was uploaded to Storage and got no row is removed again, on every exit.

const FILE_HASH = await sha256Hex(new File(['%PDF'], 'scan.pdf'))
const OTHER_ID = '33333333-3333-4333-8333-333333333333'

describe('folder scan — an unconfirmed duplicate is remembered by its hash', () => {
  it('pre-check duplicate whose original is NOT confirmed: the hash is recorded with the row it duplicates, and the file stays', async () => {
    const t = setup({ verify: { ok: false, reason: 'file_missing' } })
    await runFolderScan(t.handle, [STORED()], undefined)
    expect(t.removed).toEqual([])
    expect(t.hashPosts()).toHaveLength(1)
    expect(t.hashPosts()[0]!.body).toEqual({ sha256: FILE_HASH, existing_id: '11111111-1111-4111-8111-111111111111', file_name: 'scan.pdf', reason: 'unverified_duplicate' })
  })

  it('the server\'s duplicate answer names a row that cannot be confirmed: the hash is recorded with THAT row, and the file stays', async () => {
    const t = setup({ created: { duplicate: true, existing_id: OTHER_ID }, verify: { ok: false, reason: 'external_file' } })
    await runFolderScan(t.handle, [], undefined)
    expect(t.removed).toEqual([])
    expect(t.hashPosts().map((c) => c.body)).toEqual([{ sha256: FILE_HASH, existing_id: OTHER_ID, file_name: 'scan.pdf', reason: 'unverified_duplicate' }])
  })

  it('the server\'s duplicate answer names NO row (a transient answer: a failed lookup, a lost race): NOT remembered — the file may be the only copy of a real document, the next scan resolves it', async () => {
    const t = setup({ created: { duplicate: true } })
    const res = await runFolderScan(t.handle, [], undefined)
    expect(t.removed).toEqual([])
    expect(t.hashPosts()).toHaveLength(0)
    expect(res).toMatchObject({ duplicates: 1, errors: 1 }) // reported, as before
  })

  it('a duplicate that IS confirmed is deleted from the folder and nothing is remembered', async () => {
    const t = setup({ verify: { ok: true } })
    await runFolderScan(t.handle, [STORED()], undefined)
    expect(t.removed).toEqual(['scan.pdf'])
    expect(t.hashPosts()).toHaveLength(0)
  })

  it('a file that becomes a new row is not remembered', async () => {
    const t = setup({ extracted: { ...EXTRACTED, doc_number: '777' }, created: { id: 'new-row', needs_review: false } })
    await runFolderScan(t.handle, [STORED()], undefined)
    expect(t.hashPosts()).toHaveLength(0)
  })

  it('remembering is best-effort: a failing request neither breaks the scan nor changes the outcome', async () => {
    const t = setup({ verify: { ok: false } })
    const base = globalThis.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/folder-hashes') throw new TypeError('network down')
      return base(input, init)
    })
    const res = await runFolderScan(t.handle, [STORED()], undefined)
    expect(res).toMatchObject({ duplicates: 1, errors: 1 })
    expect(t.removed).toEqual([])
  })
})

describe('folder scan — a remembered file is skipped before the upload and before the extraction, while the memory is still true', () => {
  it('the hash is known and the row it duplicates still cannot be confirmed: no upload, no extraction, no save — the file stays, counted as skipped, no error', async () => {
    const t = setup({ known: { existing_id: OTHER_ID }, verify: { ok: false, reason: 'file_missing' } })
    const res = await runFolderScan(t.handle, [STORED()], undefined)
    expect(upload.uploadFile).not.toHaveBeenCalled()
    expect(t.calls.some((c) => c.url.startsWith('/api/extract-invoice'))).toBe(false)
    expect(t.posts()).toHaveLength(0)
    expect(t.removed).toEqual([])
    expect(res).toMatchObject({ total: 1, created: 0, duplicates: 1, skippedKnown: 1, errors: 0 })
    expect(res!.errorMessages).toEqual([])
    expect(t.hashChecks()[0]!.body).toEqual({ hashes: [FILE_HASH] })
    expect(t.verifyCalls().map((c) => c.url)).toEqual([`/api/invoices/verify?id=${OTHER_ID}`]) // the row is re-checked on every run
  })

  it('an external legacy file / an empty file / a failed check all keep the skip (the row exists but cannot be confirmed)', async () => {
    for (const verify of [{ ok: false, reason: 'external_file' }, { ok: false, reason: 'no_file' }, { ok: false, reason: 'lookup_failed' }, 'network', 500] as const) {
      upload.uploadFile.mockClear()
      const t = setup({ known: { existing_id: OTHER_ID }, verify })
      const res = await runFolderScan(t.handle, [], undefined)
      expect(upload.uploadFile, JSON.stringify(verify)).not.toHaveBeenCalled()
      expect(res, JSON.stringify(verify)).toMatchObject({ duplicates: 1, skippedKnown: 1 })
    }
  })

  it('the row it duplicated is GONE: the memory is stale — the file is scanned normally (it may be the only copy of the document)', async () => {
    const t = setup({ known: { existing_id: OTHER_ID }, verify: { ok: false, reason: 'not_found' }, extracted: { ...EXTRACTED, doc_number: '777' }, created: { id: 'new-row', needs_review: true } })
    const res = await runFolderScan(t.handle, [], undefined)
    expect(upload.uploadFile).toHaveBeenCalledTimes(1)
    expect(res).toMatchObject({ created: 1, skippedKnown: 0 })
  })

  it('the row is confirmable NOW: the file is scanned normally — a fresh extraction and match decide, and a remembered file is NEVER deleted on the strength of an old match', async () => {
    const t = setup({ known: { existing_id: OTHER_ID }, verify: { ok: true }, extracted: { ...EXTRACTED, doc_number: '777' }, created: { id: 'new-row', needs_review: true } })
    const res = await runFolderScan(t.handle, [], undefined)
    expect(upload.uploadFile).toHaveBeenCalledTimes(1)
    expect(res).toMatchObject({ created: 1, skippedKnown: 0 })
    // the old match is not trusted: the source file leaves only through the normal paths (here: because a row was created)
    const gone = setup({ known: { existing_id: OTHER_ID }, verify: { ok: true }, created: { duplicate: true, existing_id: OTHER_ID } })
    upload.uploadFile.mockClear()
    await runFolderScan(gone.handle, [], undefined)
    expect(upload.uploadFile).toHaveBeenCalledTimes(1)
  })

  it('a remembered hash with no row id (should not exist) is not trusted either: normal scan', async () => {
    const t = setup({ known: { existing_id: null }, extracted: { ...EXTRACTED, doc_number: '777' }, created: { id: 'new-row', needs_review: true } })
    const res = await runFolderScan(t.handle, [], undefined)
    expect(upload.uploadFile).toHaveBeenCalledTimes(1)
    expect(res).toMatchObject({ created: 1, skippedKnown: 0 })
  })

  it('an unknown hash goes through the normal scan: uploaded, extracted, saved', async () => {
    const t = setup({ extracted: { ...EXTRACTED, doc_number: '777' }, created: { id: 'new-row', needs_review: true } })
    const res = await runFolderScan(t.handle, [], undefined)
    expect(upload.uploadFile).toHaveBeenCalledTimes(1)
    expect(res).toMatchObject({ created: 1, skippedKnown: 0 })
  })

  it('the hash look-up fails (network error, or a non-200 answer): the scan proceeds exactly as before — nothing is skipped', async () => {
    for (const known of ['network', 500, 401] as const) {
      upload.uploadFile.mockClear()
      const t = setup({ known, extracted: { ...EXTRACTED, doc_number: '777' }, created: { id: 'new-row', needs_review: true } })
      const res = await runFolderScan(t.handle, [], undefined)
      expect(upload.uploadFile, String(known)).toHaveBeenCalledTimes(1)
      expect(res, String(known)).toMatchObject({ created: 1, skippedKnown: 0 })
    }
  })

  it('a DIFFERENT file never matches: the hash is of the bytes, not the name', async () => {
    const other = await sha256Hex(new File(['%PDF-other'], 'scan.pdf'))
    expect(other).not.toBe(FILE_HASH)
  })
})

describe('folder scan — a file that was uploaded and got no row is removed again', () => {
  const uploadedUrl = 'https://x/storage/v1/object/public/invoice-files/invoices/scan.pdf'

  it('the extraction fails: the uploaded copy is discarded', async () => {
    const t = setup({ extractStatus: 502 })
    const res = await runFolderScan(t.handle, [], undefined)
    expect(res).toMatchObject({ errors: 1 })
    expect(upload.discardUploadedFile).toHaveBeenCalledTimes(1)
    expect(upload.discardUploadedFile).toHaveBeenCalledWith(uploadedUrl)
  })

  it('the pre-check finds a duplicate: the uploaded copy is discarded (whether or not the original is confirmed)', async () => {
    for (const verify of [{ ok: true }, { ok: false }]) {
      upload.discardUploadedFile.mockClear()
      const t = setup({ verify })
      await runFolderScan(t.handle, [STORED()], undefined)
      expect(upload.discardUploadedFile, JSON.stringify(verify)).toHaveBeenCalledWith(uploadedUrl)
    }
  })

  it('saving throws (a failed request): the uploaded copy is discarded', async () => {
    const t = setup({})
    const base = globalThis.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/invoices') return new Response(JSON.stringify({ error: 'boom' }), { status: 500 })
      return base(input, init)
    })
    const res = await runFolderScan(t.handle, [], undefined)
    expect(res).toMatchObject({ created: 0, errors: 1 })
    expect(upload.discardUploadedFile).toHaveBeenCalledWith(uploadedUrl)
  })

  it('the SERVER answers duplicate: it removed the object itself — the browser does not ask again', async () => {
    const t = setup({ created: { duplicate: true, existing_id: OTHER_ID }, verify: { ok: true } })
    await runFolderScan(t.handle, [], undefined)
    expect(upload.discardUploadedFile).not.toHaveBeenCalled()
  })

  it('an upgrade keeps the uploaded file (it is the row\'s file now): nothing is discarded', async () => {
    const t = setup({ created: { duplicate: true, upgraded: true, existing_id: OTHER_ID }, verify: { ok: true } })
    await runFolderScan(t.handle, [], undefined)
    expect(upload.discardUploadedFile).not.toHaveBeenCalled()
  })

  it('a file that becomes a row keeps its upload', async () => {
    const t = setup({ extracted: { ...EXTRACTED, doc_number: '777' }, created: { id: 'new-row', needs_review: false } })
    await runFolderScan(t.handle, [STORED()], undefined)
    expect(upload.discardUploadedFile).not.toHaveBeenCalled()
  })

  it('a file skipped by its remembered hash was never uploaded, so there is nothing to discard', async () => {
    const t = setup({ known: { existing_id: OTHER_ID }, verify: { ok: false, reason: 'file_missing' } })
    await runFolderScan(t.handle, [], undefined)
    expect(upload.discardUploadedFile).not.toHaveBeenCalled()
  })
})

describe('lookupKnownHash / rememberUnverifiedDuplicate', () => {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })

  it('lookupKnownHash returns the remembered row id, or null for an unknown hash, a bad answer or a failure', async () => {
    expect(await lookupKnownHash(FILE_HASH, async () => json({ known: [{ sha256: FILE_HASH, existing_id: OTHER_ID }] }))).toEqual({ existing_id: OTHER_ID })
    expect(await lookupKnownHash(FILE_HASH, async () => json({ known: [{ sha256: FILE_HASH, existing_id: null }] }))).toEqual({ existing_id: null })
    expect(await lookupKnownHash(FILE_HASH, async () => json({ known: [] }))).toBeNull()
    expect(await lookupKnownHash(FILE_HASH, async () => json({ known: [{ sha256: 'f'.repeat(64), existing_id: OTHER_ID }] }))).toBeNull()
    expect(await lookupKnownHash(FILE_HASH, async () => json({}, 500))).toBeNull()
    expect(await lookupKnownHash(FILE_HASH, async () => { throw new TypeError('down') })).toBeNull()
  })

  it('rememberUnverifiedDuplicate never throws', async () => {
    await expect(rememberUnverifiedDuplicate({ sha256: FILE_HASH, existing_id: OTHER_ID, file_name: 'x.pdf' }, async () => { throw new TypeError('down') })).resolves.toBeUndefined()
  })
})
