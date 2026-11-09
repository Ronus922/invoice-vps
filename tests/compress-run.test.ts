import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BackupSession, sha256 } from '@/lib/compress/backup'
import { PdfSkipError } from '@/lib/compress/pdf'
import {
  evaluate, finishApply, planEntries, runCompression,
  type ApplyContext, type Engines, type InvoiceRow, type ReadStore, type StoredObject, type WriteStore,
} from '@/lib/compress/run'

// The whole pipeline against an in-memory bucket and scripted engines: no network, no database, no poppler.

const jpegBytes = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(n)])
const pdfBytes = (n: number, extra = '') => Buffer.concat([Buffer.from(`%PDF-1.7\n${extra}`), randomBytes(n)])

class MemBucket implements ReadStore, WriteStore {
  readonly objects = new Map<string, { bytes: Buffer; mime: string | null; cacheControl: string | null }>()
  readonly uploads: Array<{ path: string; contentType: string; cacheControl: string | null }> = []
  /** Paths whose bytes read back WRONG after an upload: only the first one ('first'), or every one ('always'). */
  readonly flaky = new Map<string, 'first' | 'always'>()
  put(path: string, bytes: Buffer, mime: string | null = null) {
    this.objects.set(path, { bytes, mime, cacheControl: 'max-age=3600' })
  }
  async list(): Promise<StoredObject[]> {
    return [...this.objects].map(([path, o]) => ({ path, size: o.bytes.length, mime: o.mime, cacheControl: o.cacheControl }))
  }
  async download(path: string): Promise<Buffer> {
    const o = this.objects.get(path)
    if (!o) throw new Error('not found')
    const mode = this.flaky.get(path)
    const uploads = this.uploads.filter((u) => u.path === path).length
    const wrong = mode === 'always' ? uploads >= 1 : mode === 'first' && uploads === 1
    return wrong ? Buffer.concat([o.bytes, Buffer.from('?')]) : o.bytes
  }
  async upload(path: string, bytes: Buffer, opts: { contentType: string; cacheControl: string | null }): Promise<void> {
    this.uploads.push({ path, ...opts })
    this.objects.set(path, { bytes, mime: opts.contentType, cacheControl: opts.cacheControl })
  }
}

/** Engines that halve a JPEG and shave a SCANNED PDF (no text layer, one image) to 40%, all verifications passing — overridable per test. */
const engines = (over: Partial<Engines> = {}): Engines => ({
  jpeg: async (b) => ({ bytes: b.subarray(0, Math.floor(b.length / 2)), width: 100, height: 80, quality: 70 }),
  verifyJpeg: async () => ({ ok: true }),
  openPdf: async (b) => ({
    facts: { pages: 1, imageCount: 1, imageBytes: 900 },
    compress: async () => ({ bytes: b.subarray(0, Math.floor(b.length * 0.4)), structuralBytes: null, imagesTotal: 1, imagesResampled: 1, imagesLeft: {} }),
  }),
  pdf: { analyze: async () => probe(1, 0), verify: async () => ({ ok: true }) },
  ...over,
})

const probe = (pages: number, textChars: number) => ({ pages, textChars, text: 'invoice', fonts: 'Helvetica Type 1 no no no', attachments: '0 embedded files', images: 0 })

const row = (id: string, fileUrl: string, source: string | null = 'manual'): InvoiceRow => ({ id, source, fileUrl, fileName: null })
const URL_BASE = 'https://db.example/storage/v1/object/public/invoice-files/'

describe('planEntries — rows to bucket objects', () => {
  const listing: StoredObject[] = [
    { path: 'invoices/a.pdf', size: 10, mime: 'application/pdf', cacheControl: null },
    { path: 'invoices/gmail_1_ON-EV - 54.pdf', size: 20, mime: 'application/pdf', cacheControl: null },
  ]
  it('resolves a plain path, a percent-encoded one (the stored file_url has %20, the bucket a space), and reports the rest as unresolved', () => {
    const rows = [row('1', `${URL_BASE}invoices/a.pdf`), row('2', `${URL_BASE}invoices/gmail_1_ON-EV%20-%2054.pdf`), row('3', `${URL_BASE}invoices/nope.pdf`)]
    const { entries, unresolved } = planEntries(rows, listing)
    expect(entries.map((e) => e.path)).toEqual(['invoices/a.pdf', 'invoices/gmail_1_ON-EV - 54.pdf'])
    expect(unresolved.map((r) => r.id)).toEqual(['3'])
  })
  it('a malformed percent sequence in a stored URL does not crash the plan: the raw spelling is tried, then it is unresolved', () => {
    const { entries, unresolved } = planEntries([row('1', `${URL_BASE}invoices/100%.pdf`)], [{ path: 'invoices/100%.pdf', size: 1, mime: null, cacheControl: null }])
    expect(entries.map((e) => e.path)).toEqual(['invoices/100%.pdf'])
    expect(unresolved).toEqual([])
    expect(planEntries([row('2', `${URL_BASE}invoices/100%zz.pdf`)], []).unresolved).toHaveLength(1)
  })

  it('two rows on one object make ONE entry, and a scan row marks the whole entry as scan', () => {
    const { entries } = planEntries([row('1', `${URL_BASE}invoices/a.pdf`), row('2', `${URL_BASE}invoices/a.pdf`, 'scan')], listing)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ source: 'scan' })
    expect(entries[0]!.rows.map((r) => r.id)).toEqual(['1', '2'])
  })
})

describe('evaluate — one file, start to decision', () => {
  const reason = (e: Awaited<ReturnType<typeof evaluate>>) => (e.decision.action === 'skip' ? e.decision.reason : 'replace')

  it('a JPEG that halves and verifies → replace, and the output is handed back', async () => {
    const e = await evaluate(jpegBytes(1000), 'manual', engines())
    expect(e.decision.action).toBe('replace')
    expect(e.output?.length).toBe(Math.floor(1004 / 2))
  })
  it('a scan-source row is skipped BEFORE any engine runs', async () => {
    const boom = async () => { throw new Error('engine must not run') }
    const e = await evaluate(jpegBytes(1000), 'scan', engines({ jpeg: boom }))
    expect(reason(e)).toBe('source-scan')
  })
  it('PNG bytes → unsupported-type (the extension and Content-Type are never consulted)', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(50)])
    expect(reason(await evaluate(png, 'manual', engines()))).toBe('unsupported-type')
  })
  it('a JPEG the engine says needs nothing → within-target', async () => {
    expect(reason(await evaluate(jpegBytes(100), 'manual', engines({ jpeg: async () => null })))).toBe('within-target')
  })
  it('an engine that throws → engine-failed; a failed integrity check → integrity-failed (and no output)', async () => {
    expect(reason(await evaluate(jpegBytes(100), 'manual', engines({ jpeg: async () => { throw new Error('bad') } })))).toBe('engine-failed')
    const bad = await evaluate(jpegBytes(1000), 'manual', engines({ verifyJpeg: async () => ({ ok: false, problem: 'blank' }) }))
    expect(reason(bad)).toBe('integrity-failed')
    expect(bad.output).toBeNull()
    expect(bad.note).toBe('blank')
  })
  it('a signed PDF is skipped BEFORE any engine runs — not opened, not measured', async () => {
    const boom = async () => { throw new Error('engine must not run') }
    const e = await evaluate(pdfBytes(1000, '/ByteRange [0 1 2 3]'), 'gmail', engines({ openPdf: boom }))
    expect(reason(e)).toBe('signed-pdf')
    expect(e.contentClass).toBe('pdf-signed')
    expect(e.output).toBeNull()
    expect(e.engineBytes).toBeNull()
  })
  it('encrypted → encrypted-pdf; a PDF the engine cannot open → engine-failed', async () => {
    expect(reason(await evaluate(pdfBytes(100), 'gmail', engines({ openPdf: async () => { throw new PdfSkipError('encrypted-pdf') } })))).toBe('encrypted-pdf')
    expect(reason(await evaluate(pdfBytes(100), 'gmail', engines({ openPdf: async () => { throw new Error('broken xref') } })))).toBe('engine-failed')
  })
  it('only a scanned PDF WITHOUT text is compressed (at 150 dpi); a text PDF, an OCR\'d scan and a PDF with neither are left alone and never reach the compressor', async () => {
    const dpis: Array<number | null> = []
    const spy = (pages: number, textChars: number, imageBytes: number): Partial<Engines> => ({
      openPdf: async (b) => ({
        facts: { pages, imageCount: imageBytes > 0 ? 1 : 0, imageBytes },
        compress: async (o) => { dpis.push(o.imageDpi); return { bytes: b.subarray(0, 10), structuralBytes: null, imagesTotal: 1, imagesResampled: 1, imagesLeft: {} } },
      }),
      pdf: { analyze: async () => probe(pages, textChars), verify: async () => ({ ok: true }) },
    })
    const scan = await evaluate(pdfBytes(1000), 'folder', engines(spy(1, 0, 900))) // no text, image-heavy
    const text = await evaluate(pdfBytes(1000), 'folder', engines(spy(1, 800, 10))) // born-digital text invoice
    const ocr = await evaluate(pdfBytes(1000), 'folder', engines(spy(1, 800, 900))) // text layer + image-dominant (OCR'd scan)
    const blank = await evaluate(pdfBytes(1000), 'folder', engines(spy(1, 0, 0))) // neither text nor images
    expect(dpis).toEqual([150]) // the compressor ran exactly once
    expect([text, ocr, blank].map(reason)).toEqual(['text-layer-pdf', 'text-layer-pdf', 'class-excluded'])
    expect(scan.contentClass).toBe('pdf-scanned')
    expect(reason(scan)).toBe('replace')
    for (const x of [text, ocr, blank]) {
      expect(x.output).toBeNull()
      expect(x.engineBytes).toBeNull()
    }
    expect(text.contentClass).toBe('pdf-text')
    expect(ocr.contentClass).toBe('pdf-scanned-ocr')
    expect(blank.contentClass).toBe('pdf-other')
  })

  it('holds pdf-lib\'s own rewrite to the EXACT standard even when an image was resampled — and judges the image change separately', async () => {
    const calls: Array<{ original: number; output: number; exact: boolean }> = []
    const mk = (resampled: number): Partial<Engines> => ({
      openPdf: async (b) => ({
        facts: { pages: 1, imageCount: 1, imageBytes: 900 },
        compress: async () => ({
          bytes: b.subarray(0, 400),
          structuralBytes: resampled > 0 ? b.subarray(0, 900) : null,
          imagesTotal: 1, imagesResampled: resampled, imagesLeft: {},
        }),
      }),
      pdf: { analyze: async () => probe(1, 0), verify: async (o, out, _p, opts) => { calls.push({ original: o.length, output: out.length, exact: opts.exact }); return { ok: true } } },
    })
    const bytes = pdfBytes(2000)
    await evaluate(bytes, 'folder', engines(mk(1)))
    // (1) original vs pdf-lib-only rewrite: exact; (2) that rewrite vs the final output: tolerant
    expect(calls).toEqual([{ original: bytes.length, output: 900, exact: true }, { original: 900, output: 400, exact: false }])
    calls.length = 0
    await evaluate(bytes, 'folder', engines(mk(0)))
    expect(calls).toEqual([{ original: bytes.length, output: 400, exact: true }]) // nothing resampled: one exact check
  })

  it('a failure in either stage is named, so the report says WHICH rewrite broke', async () => {
    const failing = (stage: 'structural' | 'resample'): Partial<Engines> => ({
      openPdf: async (b) => ({ facts: { pages: 1, imageCount: 1, imageBytes: 900 }, compress: async () => ({ bytes: b.subarray(0, 400), structuralBytes: b.subarray(0, 900), imagesTotal: 1, imagesResampled: 1, imagesLeft: {} }) }),
      pdf: { analyze: async () => probe(1, 0), verify: async (_o, _out, _p, opts) => (opts.exact === (stage === 'structural') ? { ok: false, problem: 'page 1 looks different' } : { ok: true }) },
    })
    expect((await evaluate(pdfBytes(2000), 'folder', engines(failing('structural')))).note).toBe('structural rewrite: page 1 looks different')
    expect((await evaluate(pdfBytes(2000), 'folder', engines(failing('resample')))).note).toBe('after resampling: page 1 looks different')
  })
})

describe('runCompression — a DRY RUN writes nothing', () => {
  it('decides "replace" for the files but the bucket is byte-for-byte what it was and nothing is uploaded', async () => {
    const bucket = new MemBucket()
    bucket.put('invoices/a.jpg', jpegBytes(5000), 'image/jpeg')
    bucket.put('invoices/b.pdf', pdfBytes(5000), 'application/pdf')
    const before = new Map([...bucket.objects].map(([p, o]) => [p, sha256(o.bytes)]))
    const { entries } = planEntries([row('1', `${URL_BASE}invoices/a.jpg`), row('2', `${URL_BASE}invoices/b.pdf`)], await bucket.list())

    const out = await runCompression(entries, bucket, engines(), { limit: null, concurrency: 3 })

    expect(out.reports.map((r) => r.decision.action)).toEqual(['replace', 'replace'])
    expect(bucket.uploads).toEqual([])
    expect(new Map([...bucket.objects].map(([p, o]) => [p, sha256(o.bytes)]))).toEqual(before)
  })

  it('a download that fails becomes a skip row, not a crash', async () => {
    const bucket = new MemBucket()
    bucket.put('invoices/a.jpg', jpegBytes(500))
    const { entries } = planEntries([row('1', `${URL_BASE}invoices/a.jpg`)], await bucket.list())
    bucket.objects.delete('invoices/a.jpg')
    const out = await runCompression(entries, bucket, engines(), { limit: null, concurrency: 1 })
    expect(out.reports[0]!.decision).toEqual({ action: 'skip', reason: 'download-failed' })
  })

  it('bytes whose size is not the one the bucket lists are never processed (not the object we think it is)', async () => {
    const bucket = new MemBucket()
    bucket.put('invoices/a.jpg', jpegBytes(5000))
    const { entries } = planEntries([row('1', `${URL_BASE}invoices/a.jpg`)], await bucket.list())
    entries[0]!.object = { ...entries[0]!.object, size: 12345 } // the listing says something else
    const out = await runCompression(entries, bucket, engines({ jpeg: async () => { throw new Error('must not run') } }), { limit: null, concurrency: 1 })
    expect(out.reports[0]!.decision).toEqual({ action: 'skip', reason: 'size-mismatch' })
    expect(out.reports[0]!.note).toMatch(/downloaded 5004 bytes, listed 12345/)
  })

  it('--limit takes a sample across kinds and skips what no rule lets us touch (scan source, signed, text PDF, already small)', async () => {
    const bucket = new MemBucket()
    bucket.put('invoices/j1.jpg', jpegBytes(400_000))
    bucket.put('invoices/j2.jpg', jpegBytes(500_000))
    bucket.put('invoices/small.jpg', jpegBytes(1000)) // ≤ 300KB: not worth a slot
    bucket.put('invoices/p1.pdf', pdfBytes(3000))
    bucket.put('invoices/signed.pdf', pdfBytes(9000, '/ByteRange [0 1 2 3]')) // signed: no slot
    bucket.put('invoices/text.pdf', pdfBytes(9000, 'TEXTLAYER')) // a text PDF is out of scope: no slot
    bucket.put('invoices/s.jpg', jpegBytes(400_000)) // scan source: no slot
    const rows = ['j1.jpg', 'j2.jpg', 'small.jpg', 'p1.pdf', 'signed.pdf', 'text.pdf'].map((n, i) => row(String(i), `${URL_BASE}invoices/${n}`))
    rows.push(row('9', `${URL_BASE}invoices/s.jpg`, 'scan'))
    const { entries } = planEntries(rows, await bucket.list())

    const eng = engines({ pdf: { analyze: async (b) => probe(1, b.includes('TEXTLAYER') ? 800 : 0), verify: async () => ({ ok: true }) } })
    const out = await runCompression(entries, bucket, eng, { limit: 2, concurrency: 2 })

    expect(out.planned).toBe(7)
    expect(out.eligible).toBe(3) // j1, j2, p1
    expect(out.examined).toBe(2)
    expect(new Set(out.reports.map((r) => r.kind))).toEqual(new Set(['jpeg', 'pdf'])) // one of each
  })
})

describe('runCompression --apply — backup, replace, read back, roll back', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'apply-test-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const setup = async () => {
    const bucket = new MemBucket()
    const original = jpegBytes(8000)
    bucket.put('invoices/a.jpg', original, 'image/jpeg')
    bucket.put('invoices/legacy.pdf', pdfBytes(6000), 'application/octet-stream') // 12 of these exist for real
    const { entries } = planEntries([row('1', `${URL_BASE}invoices/a.jpg`), row('2', `${URL_BASE}invoices/legacy.pdf`)], await bucket.list())
    const backup = new BackupSession(join(dir, 'backup'))
    await backup.init()
    const apply: ApplyContext = { writer: bucket, backup }
    return { bucket, original, entries, apply, backup }
  }
  const opts = { limit: null, concurrency: 4 }

  it('happy path: replaced in place at the SAME path with the SAME Content-Type, read back identical, backup deleted automatically', async () => {
    const { bucket, original, entries, apply, backup } = await setup()
    const out = await runCompression(entries, bucket, engines(), opts, apply)

    expect(out.reports.map((r) => r.applied)).toEqual(['replaced', 'replaced'])
    expect(bucket.objects.get('invoices/a.jpg')!.bytes.length).toBe(Math.floor(original.length / 2))
    expect(bucket.uploads.map((u) => [u.path, u.contentType])).toEqual([
      ['invoices/a.jpg', 'image/jpeg'],
      ['invoices/legacy.pdf', 'application/octet-stream'], // not "fixed" behind anyone's back
    ])
    expect(bucket.uploads.every((u) => u.cacheControl === 'max-age=3600')).toBe(true)

    const done = await finishApply(apply, out.reports, bucket)
    expect(done).toMatchObject({ backupDeleted: true, problem: null })
    await expect(stat(backup.root)).rejects.toThrow()
  })

  it('the backup holds the ORIGINAL bytes of every replaced object (hash-checked against what the bucket held)', async () => {
    const { bucket, original, entries, apply, backup } = await setup()
    const legacy = bucket.objects.get('invoices/legacy.pdf')!.bytes
    await runCompression(entries, bucket, engines(), opts, apply)
    expect(backup.staged.map((e) => [e.path, e.sha256])).toEqual([['invoices/a.jpg', sha256(original)], ['invoices/legacy.pdf', sha256(legacy)]])
  })

  it('--keep-backup: everything verified, and the backup is still there afterwards', async () => {
    const { bucket, entries, apply, backup } = await setup()
    const out = await runCompression(entries, bucket, engines(), opts, apply)
    const done = await finishApply(apply, out.reports, bucket, { keepBackup: true })
    expect(done).toMatchObject({ backupDeleted: false, problem: null })
    expect((await stat(backup.tarPath)).size).toBeGreaterThan(0)
  })

  it('an unproven backup archive is never deleted: finishApply keeps it and says why', async () => {
    const { bucket, entries, apply, backup } = await setup()
    const out = await runCompression(entries, bucket, engines(), opts, apply)
    backup.archive = async () => 'archive failed: disk full'
    const done = await finishApply(apply, out.reports, bucket)
    expect(done).toMatchObject({ backupDeleted: false, problem: 'archive failed: disk full' })
    await expect(stat(backup.root)).resolves.toBeDefined()
  })

  it('an upload that throws leaves the object as it was (rolled back), and a rollback upload that ALSO throws is "rollback-failed" and stops the run', async () => {
    const { bucket, original, entries, apply } = await setup()
    const realUpload = bucket.upload.bind(bucket)
    let calls = 0
    bucket.upload = async (path, bytes, o) => { calls++; if (calls === 1) { await realUpload(path, bytes, o); throw new Error('connection reset') } return realUpload(path, bytes, o) }
    const first = await runCompression(entries, bucket, engines(), opts, apply)
    expect(first.reports[0]!.applied).toBe('rolled-back') // the failed upload was undone from the original
    expect(bucket.objects.get('invoices/a.jpg')!.bytes.equals(original)).toBe(true)
    expect(first.reports[0]!.decision).toEqual({ action: 'skip', reason: 'apply-failed' })

    const s2 = await setup()
    s2.bucket.upload = async () => { throw new Error('store is down') }
    const second = await runCompression(s2.entries, s2.bucket, engines(), opts, s2.apply)
    expect(second.reports.map((r) => r.applied)).toEqual(['rollback-failed', undefined])
    expect(second.reports.map((r) => r.decision)).toEqual([{ action: 'skip', reason: 'apply-failed' }, { action: 'skip', reason: 'apply-failed' }]) // nothing counted as replaced
  })

  it('a signed PDF is untouched end to end under --apply, and never reaches the backup', async () => {
    const bucket = new MemBucket()
    const signed = pdfBytes(5000, '/ByteRange [0 1 2 3]')
    bucket.put('invoices/signed.pdf', signed, 'application/pdf')
    const { entries } = planEntries([row('1', `${URL_BASE}invoices/signed.pdf`)], await bucket.list())
    const backup = new BackupSession(join(dir, 'signed-backup'))
    await backup.init()
    const out = await runCompression(entries, bucket, engines(), opts, { writer: bucket, backup })
    expect(out.reports[0]!.decision).toEqual({ action: 'skip', reason: 'signed-pdf' })
    expect(bucket.uploads).toEqual([])
    expect(bucket.objects.get('invoices/signed.pdf')!.bytes.equals(signed)).toBe(true)
    expect(backup.staged).toEqual([])
  })

  it('a store that reads back different bytes → the original is put back, the run says so, the backup is KEPT', async () => {
    const { bucket, original, entries, apply, backup } = await setup()
    bucket.flaky.set('invoices/a.jpg', 'first')
    const out = await runCompression(entries, bucket, engines(), opts, apply)

    const a = out.reports.find((r) => r.path === 'invoices/a.jpg')!
    expect(a.applied).toBe('rolled-back')
    expect(bucket.objects.get('invoices/a.jpg')!.bytes.equals(original)).toBe(true) // restored
    expect(out.reports.find((r) => r.path === 'invoices/legacy.pdf')!.applied).toBe('replaced') // the healthy one still went through

    const done = await finishApply(apply, out.reports, bucket)
    expect(done.backupDeleted).toBe(false)
    expect(done.problem).toMatch(/1 object\(s\) rolled back or failed: invoices\/a\.jpg \(rolled-back\)/)
    expect((await stat(backup.tarPath)).size).toBeGreaterThan(0)
  })

  it('a rollback that cannot be verified stops further writes: the next file is not touched', async () => {
    const { bucket, entries, apply } = await setup()
    bucket.flaky.set('invoices/a.jpg', 'always')
    const out = await runCompression(entries, bucket, engines(), opts, apply)
    expect(out.reports[0]!.applied).toBe('rollback-failed')
    expect(out.reports[1]!.applied).toBeUndefined() // would have qualified, but writing had stopped
    expect(bucket.uploads.some((u) => u.path === 'invoices/legacy.pdf')).toBe(false)
    expect((await finishApply(apply, out.reports, bucket)).backupDeleted).toBe(false)
  })

  it('no safety copy → no replacement: a backup that cannot be written stops the run and the object is untouched', async () => {
    const { bucket, original, entries, apply, backup } = await setup()
    backup.stage = async () => { throw new Error('disk full') }
    await expect(runCompression(entries, bucket, engines(), opts, apply)).rejects.toThrow(/backup failed for invoices\/a\.jpg: disk full/)
    expect(bucket.uploads).toEqual([])
    expect(bucket.objects.get('invoices/a.jpg')!.bytes.equals(original)).toBe(true)
  })

  it('a replaced object whose size in the bucket is not what we wrote keeps the backup', async () => {
    const { bucket, entries, apply } = await setup()
    const out = await runCompression(entries, bucket, engines(), opts, apply)
    const o = bucket.objects.get('invoices/a.jpg')!
    bucket.objects.set('invoices/a.jpg', { ...o, bytes: Buffer.concat([o.bytes, Buffer.from('x')]) })
    const done = await finishApply(apply, out.reports, bucket)
    expect(done.backupDeleted).toBe(false)
    expect(done.problem).toMatch(/invoices\/a\.jpg: bucket says/)
  })

  it('nothing qualified → nothing staged → the empty backup directory is removed', async () => {
    const { bucket, entries, apply, backup } = await setup()
    const none = engines({ jpeg: async () => null, openPdf: async () => { throw new PdfSkipError('signed-pdf') } })
    const out = await runCompression(entries, bucket, none, opts, apply)
    expect(out.reports.map((r) => r.applied)).toEqual([undefined, undefined])
    expect(await finishApply(apply, out.reports, bucket)).toMatchObject({ backupDeleted: true })
    await expect(stat(backup.root)).rejects.toThrow()
  })
})
