import { storagePathFromFileUrl } from '../file-url'
import { BackupSession, sha256 } from './backup'
import {
  IMAGE_TARGET_BYTES, PDF_SCAN_DPI, classOfKind, classifyPdf, decide, excludedReason, pickSample, sniffKind,
  type ContentClass, type Decision, type FileKind, type SkipReason,
} from './decision'
import { recompressJpeg, verifyJpeg, type IntegrityVerdict, type JpegResult } from './jpeg'
import { PdfSkipError, isSignedPdf, openPdf, type OpenedPdf } from './pdf'
import { popplerTools, type PdfProbe, type PdfTools } from './pdf-verify'

// The orchestration: which bucket object belongs to which invoice row, what happens to each one, and — for
// --apply only — how a replacement is backed up, uploaded, read back and (if it does not match) rolled back.
// Everything that touches the outside world comes in through an interface (ReadStore, WriteStore, Engines), so
// the tests run the whole thing against in-memory fakes, and the dry run is handed NO WriteStore at all.

export interface InvoiceRow {
  id: string
  source: string | null
  fileUrl: string
  fileName: string | null
}

export interface StoredObject {
  path: string
  size: number
  mime: string | null
  cacheControl: string | null
  /** When the bucket created the object (ISO). Only the orphan sweep reads it: an upload in progress looks like an orphan. */
  createdAt?: string | null
}

export interface ReadStore {
  list(): Promise<StoredObject[]>
  download(path: string): Promise<Buffer>
}

export interface WriteStore {
  upload(path: string, bytes: Buffer, opts: { contentType: string; cacheControl: string | null }): Promise<void>
}

export interface Engines {
  jpeg(input: Buffer): Promise<JpegResult | null>
  verifyJpeg(before: Buffer, after: Buffer): Promise<IntegrityVerdict>
  openPdf(input: Buffer, opts?: { allowSigned?: boolean }): Promise<OpenedPdf>
  pdf: PdfTools
}

export const realEngines = (): Engines => ({ jpeg: recompressJpeg, verifyJpeg, openPdf, pdf: popplerTools() })

// ── Rows → objects ─────────────────────────────────────────────────────────────────────────────────

export interface Entry {
  /** The object's real name in the bucket. */
  path: string
  object: StoredObject
  rows: InvoiceRow[]
  /** 'scan' when ANY row pointing at the object is a scan; otherwise the first row's source. */
  source: string | null
}

/** Pairs every row with the object it points at. A stored file_url may be percent-encoded (one row has `%20`
 *  for a space) while the bucket holds the decoded name, so both spellings are tried. One entry per OBJECT:
 *  two rows sharing an object are processed once. */
export function planEntries(rows: readonly InvoiceRow[], listing: readonly StoredObject[]): { entries: Entry[]; unresolved: InvoiceRow[] } {
  const byPath = new Map(listing.map((o) => [o.path, o]))
  const entries = new Map<string, Entry>()
  const unresolved: InvoiceRow[] = []
  for (const row of rows) {
    const raw = storagePathFromFileUrl(row.fileUrl)
    const candidates: string[] = []
    if (raw) {
      candidates.push(raw)
      try {
        candidates.push(decodeURIComponent(raw))
      } catch {
        // not valid percent-encoding: the raw spelling is all there is
      }
    }
    const hit = candidates.find((c) => byPath.has(c))
    if (!hit) {
      unresolved.push(row)
      continue
    }
    const entry = entries.get(hit) ?? { path: hit, object: byPath.get(hit)!, rows: [], source: row.source }
    entry.rows.push(row)
    if (row.source === 'scan') entry.source = 'scan'
    entries.set(hit, entry)
  }
  return { entries: [...entries.values()], unresolved }
}

// ── One file ───────────────────────────────────────────────────────────────────────────────────────

export interface Evaluation {
  kind: FileKind
  contentClass: ContentClass
  beforeBytes: number
  /** The engine output that passed its integrity check AND qualifies for replacement; null otherwise. */
  output: Buffer | null
  /** The engine's output size even when the file ends up skipped (so a rule's cost can be reported). */
  engineBytes: number | null
  decision: Decision
  note: string
}

/** "2/5 images resampled; left: already-within-dpi 2, mask 1" — why an image was NOT touched is what explains a file that did not shrink. */
function pdfNote(res: { imagesTotal: number; imagesResampled: number; imagesLeft: Record<string, number> }): string {
  const left = Object.entries(res.imagesLeft).sort((a, b) => b[1] - a[1]).map(([why, n]) => `${why} ${n}`).join(', ')
  return `${res.imagesResampled}/${res.imagesTotal} images resampled${left ? `; left: ${left}` : ''}`
}

const message = (err: unknown): string => (err instanceof Error ? err.message.split('\n')[0]!.slice(0, 100) : 'error')

type PdfProbeResult =
  | { ok: true; opened: OpenedPdf; probe: PdfProbe; contentClass: ContentClass }
  | { ok: false; reason: SkipReason; note: string }

/** Opens an (unsigned) PDF and says what class it is. Shared by evaluate and by the --limit sampler, so the sample is
 *  drawn only from files the evaluation will actually work on. */
async function probePdf(bytes: Buffer, e: Engines): Promise<PdfProbeResult> {
  let opened: OpenedPdf
  try {
    opened = await e.openPdf(bytes)
  } catch (err) {
    return err instanceof PdfSkipError ? { ok: false, reason: err.reason, note: '' } : { ok: false, reason: 'engine-failed', note: message(err) }
  }
  let probe: PdfProbe
  try {
    probe = await e.pdf.analyze(bytes)
  } catch (err) {
    return { ok: false, reason: 'engine-failed', note: `poppler cannot read the original: ${message(err)}` }
  }
  const contentClass = classifyPdf({
    pages: probe.pages,
    textChars: probe.textChars,
    imageBytes: opened.facts.imageBytes,
    imageCount: opened.facts.imageCount,
    fileBytes: bytes.length,
  })
  return { ok: true, opened, probe, contentClass }
}

export async function evaluate(bytes: Buffer, source: string | null, e: Engines): Promise<Evaluation> {
  const kind = sniffKind(bytes)
  const base = { kind, contentClass: classOfKind(kind), beforeBytes: bytes.length, output: null, engineBytes: null, note: '' }
  const skip = (reason: SkipReason, note = ''): Evaluation => ({ ...base, decision: { action: 'skip', reason }, note })

  if (source === 'scan' || (kind !== 'pdf' && kind !== 'jpeg')) {
    return { ...base, decision: decide({ source, kind, contentClass: base.contentClass, beforeBytes: bytes.length, preSkip: null, afterBytes: null, integrityOk: null }) }
  }

  if (kind === 'jpeg') {
    let r: JpegResult | null
    try {
      r = await e.jpeg(bytes)
    } catch (err) {
      return skip('engine-failed', message(err))
    }
    if (!r) return skip('within-target')
    const v = await e.verifyJpeg(bytes, r.bytes)
    const decision = decide({ source, kind, contentClass: 'jpeg', beforeBytes: bytes.length, preSkip: null, afterBytes: r.bytes.length, integrityOk: v.ok })
    return {
      ...base,
      engineBytes: r.bytes.length,
      output: decision.action === 'replace' ? r.bytes : null,
      decision,
      note: v.ok ? `q${r.quality} ${r.width}x${r.height}` : (v.problem ?? 'integrity'),
    }
  }

  // PDF. Two classes are out of scope and decided BEFORE any engine runs, so nothing about them is even computed:
  // signed (a rewrite breaks the signature) and anything with a text layer. Only a scan without text is compressed.
  if (isSignedPdf(bytes)) return { ...skip('signed-pdf'), contentClass: 'pdf-signed' }
  const p = await probePdf(bytes, e)
  if (!p.ok) return skip(p.reason, p.note)
  const { opened, probe, contentClass } = p
  const excluded = excludedReason(contentClass)
  if (excluded) return { ...skip(excluded), contentClass }
  let res
  try {
    res = await opened.compress({ imageDpi: PDF_SCAN_DPI })
  } catch (err) {
    return { ...skip('engine-failed', message(err)), contentClass }
  }
  // Two questions, asked separately. (1) Did pdf-lib's own rewrite change anything? Held to an EXACT standard
  // (pixel-identical pages, same text, fonts, embedded files) whether or not an image was resampled, so a dropped
  // line or stamp cannot hide behind the tolerance an image change needs. (2) Is the resampled picture still the page?
  const structural = res.structuralBytes ?? res.bytes
  let v = await e.pdf.verify(bytes, structural, probe, { exact: true })
  if (v.ok && res.imagesResampled > 0) {
    v = await e.pdf.verify(structural, res.bytes, probe, { exact: false })
    if (!v.ok) v = { ok: false, problem: `after resampling: ${v.problem ?? ''}` }
  } else if (!v.ok) {
    v = { ok: false, problem: `structural rewrite: ${v.problem ?? ''}` }
  }
  const decision = decide({ source, kind, contentClass, beforeBytes: bytes.length, preSkip: null, afterBytes: res.bytes.length, integrityOk: v.ok })
  return {
    ...base,
    contentClass,
    engineBytes: res.bytes.length,
    output: decision.action === 'replace' ? res.bytes : null,
    decision,
    note: v.ok ? pdfNote(res) : (v.problem ?? 'integrity'),
  }
}

// ── Many files ─────────────────────────────────────────────────────────────────────────────────────

export async function mapPool<T, R>(items: readonly T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]!, i)
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, worker))
  return out
}

export interface FileReport {
  ids: string[]
  path: string
  source: string | null
  kind: FileKind
  contentClass: ContentClass
  beforeBytes: number
  engineBytes: number | null
  decision: Decision
  note: string
  /** --apply only: what happened to the object. */
  applied?: 'replaced' | 'rolled-back' | 'rollback-failed'
  /** --apply only: the size the replacement has in the bucket. */
  appliedBytes?: number
}

export interface ApplyContext {
  writer: WriteStore
  backup: BackupSession
}

export interface RunOptions {
  limit: number | null
  concurrency: number
  onProgress?: (done: number, total: number, last: FileReport) => void
}

export interface RunOutput {
  reports: FileReport[]
  /** Objects in the plan / files that qualified to be sampled / files actually examined. */
  planned: number
  eligible: number
  examined: number
}

/** `--limit N`: download everything once (cheap: ~15s for the whole bucket), keep what could actually be improved,
 *  and take N of them across kinds. A file that no rule lets us touch (scan source, signed, already ≤300KB)
 *  would only waste a slot in a trial of the engine. */
async function select(entries: readonly Entry[], reader: ReadStore, engines: Engines, limit: number, concurrency: number): Promise<{ selected: Entry[]; eligible: number }> {
  const info = await mapPool(entries, concurrency, async (entry) => {
    try {
      const b = await reader.download(entry.path)
      const kind = sniffKind(b)
      let worthIt = false
      if (entry.source !== 'scan') {
        if (kind === 'jpeg') worthIt = b.length > IMAGE_TARGET_BYTES
        else if (kind === 'pdf' && !isSignedPdf(b)) {
          const p = await probePdf(b, engines) // only a scan without text is in scope: don't spend a trial slot on a text PDF
          worthIt = p.ok && excludedReason(p.contentClass) === null
        }
      }
      return { key: entry.path, kind, bytes: b.length, worthIt, entry }
    } catch {
      return { key: entry.path, kind: 'unknown' as FileKind, bytes: 0, worthIt: false, entry }
    }
  })
  const eligible = info.filter((x) => x.worthIt)
  return { selected: pickSample(eligible, limit).map((x) => x.entry), eligible: eligible.length }
}

class ApplyAbort extends Error {}

async function applyOne(entry: Entry, kind: FileKind, original: Buffer, output: Buffer, reader: ReadStore, apply: ApplyContext): Promise<'replaced' | 'rolled-back' | 'rollback-failed'> {
  try {
    await apply.backup.stage(entry.path, original)
  } catch (err) {
    // No safety copy → the object is NOT touched, and the whole run stops (never swallowed as a per-file skip).
    throw new ApplyAbort(`backup failed for ${entry.path}: ${message(err)}`)
  }
  const meta = {
    // Whatever Content-Type the object already has stays as it is — 12 stored PDFs carry application/octet-stream and this feature does not "fix" them behind anyone's back.
    contentType: entry.object.mime ?? (kind === 'pdf' ? 'application/pdf' : 'image/jpeg'),
    cacheControl: entry.object.cacheControl,
  }
  try {
    await apply.writer.upload(entry.path, output, meta)
    if (sha256(await reader.download(entry.path)) === sha256(output)) return 'replaced'
  } catch {
    // fall through to the rollback
  }
  try {
    await apply.writer.upload(entry.path, original, meta)
    return sha256(await reader.download(entry.path)) === sha256(original) ? 'rolled-back' : 'rollback-failed'
  } catch {
    return 'rollback-failed'
  }
}

export async function runCompression(entries: readonly Entry[], reader: ReadStore, engines: Engines, opts: RunOptions, apply?: ApplyContext): Promise<RunOutput> {
  let chosen: readonly Entry[] = entries
  let eligible = entries.length
  if (opts.limit !== null) {
    const s = await select(entries, reader, engines, opts.limit, opts.concurrency)
    chosen = s.selected
    eligible = s.eligible
  }

  let done = 0
  let aborted = false
  const reports = await mapPool(chosen, apply ? 1 : opts.concurrency, async (entry): Promise<FileReport> => {
    const head = { ids: entry.rows.map((r) => r.id), path: entry.path, source: entry.source }
    let report: FileReport
    try {
      const bytes = await reader.download(entry.path)
      if (bytes.length !== entry.object.size) {
        // Not the object the listing describes (a name the transport mangled, a concurrent write): never process it.
        const guess = sniffKind(bytes)
        report = { ...head, kind: guess, contentClass: classOfKind(guess), beforeBytes: entry.object.size, engineBytes: null, decision: { action: 'skip', reason: 'size-mismatch' }, note: `downloaded ${bytes.length} bytes, listed ${entry.object.size}` }
        opts.onProgress?.(++done, chosen.length, report)
        return report
      }
      const ev = await evaluate(bytes, entry.source, engines)
      report = { ...head, kind: ev.kind, contentClass: ev.contentClass, beforeBytes: ev.beforeBytes, engineBytes: ev.engineBytes, decision: ev.decision, note: ev.note }
      if (apply && ev.decision.action === 'replace' && ev.output) {
        if (aborted) {
          report.decision = { action: 'skip', reason: 'apply-failed' } // would have qualified, but writing had stopped
          report.note = 'run stopped before this object'
        } else {
          report.applied = await applyOne(entry, ev.kind, bytes, ev.output, reader, apply)
          if (report.applied === 'replaced') report.appliedBytes = ev.output.length
          else report.decision = { action: 'skip', reason: 'apply-failed' } // rolled back: the object is as it was
          if (report.applied === 'rollback-failed') aborted = true // stop writing; the backup stays
        }
      }
    } catch (err) {
      if (err instanceof ApplyAbort) throw err
      report = { ...head, kind: 'unknown', contentClass: 'unknown', beforeBytes: entry.object.size, engineBytes: null, decision: { action: 'skip', reason: 'download-failed' }, note: message(err) }
    }
    opts.onProgress?.(++done, chosen.length, report)
    return report
  })
  return { reports, planned: entries.length, eligible, examined: chosen.length }
}

export interface ApplyOutcome {
  /** True when the backup directory was deleted because everything passed. */
  backupDeleted: boolean
  backupPath: string
  problem: string | null
}

/** After an --apply run: pack and prove the backup, re-list the bucket to confirm every replaced object has the
 *  size we wrote, and only then delete the backup. Any doubt keeps it. */
export async function finishApply(apply: ApplyContext, reports: readonly FileReport[], reader: ReadStore, opts: { keepBackup?: boolean } = {}): Promise<ApplyOutcome> {
  const root = apply.backup.root
  if (apply.backup.staged.length === 0) {
    await apply.backup.dispose()
    return { backupDeleted: true, backupPath: root, problem: null }
  }
  const archiveProblem = await apply.backup.archive()
  if (archiveProblem) return { backupDeleted: false, backupPath: root, problem: archiveProblem }

  const failed = reports.filter((r) => r.applied !== undefined && r.applied !== 'replaced')
  if (failed.length > 0) return { backupDeleted: false, backupPath: root, problem: `${failed.length} object(s) rolled back or failed: ${failed.map((f) => `${f.path} (${f.applied})`).join(', ')}` }

  const sizes = new Map((await reader.list()).map((o) => [o.path, o.size]))
  for (const r of reports) {
    if (r.applied === 'replaced' && sizes.get(r.path) !== r.appliedBytes) {
      return { backupDeleted: false, backupPath: root, problem: `${r.path}: bucket says ${sizes.get(r.path) ?? 'missing'} bytes, expected ${r.appliedBytes}` }
    }
  }
  if (opts.keepBackup) return { backupDeleted: false, backupPath: root, problem: null } // verified, and kept on request
  await apply.backup.dispose()
  return { backupDeleted: true, backupPath: root, problem: null }
}
