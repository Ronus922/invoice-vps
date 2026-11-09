import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { meanAbsDiff, type IntegrityVerdict } from './jpeg'

// "Is the new PDF the same document?" — checked with poppler, an INDEPENDENT reader (not the library that wrote
// the file), per file, before any replacement is even considered:
//   · it opens (pdfinfo) and has the same number of pages;
//   · the text layer is identical: pdftotext of the output equals pdftotext of the original;
//   · the same fonts (pdffonts), the same embedded files (pdfdetach) and the same number of image placements (pdfimages);
//   · the first pages LOOK the same: rendered small (pdftoppm) and compared pixel by pixel on grey. When no image
//     was touched (a structure-only rewrite) the renders must be IDENTICAL — rendering is deterministic, so any
//     difference means the rewrite dropped or changed something (a ruled line, a box, a stamp) that the text
//     comparison cannot see. pdf-lib, which writes the file, silently skips objects it cannot parse, so this is not
//     a theoretical worry: three Gnostice payslips lost half their text that way and were caught by the text check.
// A missing poppler tool is an error, never a silent pass: the script refuses to run without all three.

const run = promisify(execFile)
const TOOLS = ['pdftotext', 'pdfinfo', 'pdftoppm', 'pdffonts', 'pdfdetach', 'pdfimages'] as const
const TOOL_TIMEOUT_MS = 90_000
/** How many pages are rendered and compared. The longest PDF in the bucket has 8 pages; 30 covers any invoice and
 *  keeps a pathological 500-page file from taking minutes. */
const RENDER_PAGES = 30
const RENDER_DPI = 60
/** Mean absolute grey difference (0–255) between the renders of one page above which the page "changed" when
 *  an image WAS resampled. A 300 → 150 dpi scan renders within ~3 of the original; a lost or inverted image
 *  lands far above. */
const MAX_PAGE_DIFF = 10
/** …and when NO image was touched the renders must be the same picture: a one-point line across a page is already
 *  ~0.05, so this catches anything that is visible at all while ignoring floating-point noise. */
const MAX_EXACT_DIFF = 0.02

export interface PdfProbe {
  pages: number
  /** Non-whitespace characters of the text layer. */
  textChars: number
  /** The text layer with every run of whitespace collapsed to one space — what two files are compared on. */
  text: string
  /** pdffonts without the object-number column, sorted: which fonts, of what kind, embedded or not. */
  fonts: string
  /** pdfdetach -list: the embedded files (ZUGFeRD / invoice XML, …). */
  attachments: string
  /** Image placements pdfimages sees. */
  images: number
}

export interface PdfTools {
  /** Opens the ORIGINAL and reports its pages and text layer. */
  analyze(pdf: Buffer): Promise<PdfProbe>
  /** Judges `output` against `original` (and its already-taken `before` probe). `exact`: no image was resampled,
   *  so the pages must render identically. */
  verify(original: Buffer, output: Buffer, before: PdfProbe, opts: { exact: boolean }): Promise<IntegrityVerdict>
}

export async function popplerStatus(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = []
  for (const tool of TOOLS) {
    try {
      await run(tool, ['-v'], { timeout: 10_000 }) // poppler prints its version to stderr
    } catch (err) {
      // Present is present whatever the exit code: `pdfdetach -v` exits 99. Only "could not start" means missing.
      if (err instanceof Error && 'code' in err && (err as { code: unknown }).code === 'ENOENT') missing.push(tool)
    }
  }
  return { ok: missing.length === 0, missing }
}

async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'compress-pdf-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function probeFile(file: string): Promise<PdfProbe> {
  const info = await run('pdfinfo', [file], { timeout: TOOL_TIMEOUT_MS })
  const pages = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1] ?? 0)
  const txt = await run('pdftotext', ['-q', '-enc', 'UTF-8', file, '-'], { timeout: TOOL_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 })
  const text = txt.stdout.replace(/\s+/g, ' ').trim()
  const fonts = (await run('pdffonts', [file], { timeout: TOOL_TIMEOUT_MS })).stdout
    .split('\n')
    .slice(2) // header + rule
    .map((l) => l.trim().split(/\s+/).slice(0, -2).join(' ')) // drop the "object ID" column (two tokens)
    .filter(Boolean)
    .sort()
    .join('\n')
  const attachments = (await run('pdfdetach', ['-list', file], { timeout: TOOL_TIMEOUT_MS })).stdout.trim()
  const images = (await run('pdfimages', ['-list', file], { timeout: TOOL_TIMEOUT_MS })).stdout.split('\n').slice(2).filter((l) => l.trim()).length
  return { pages, textChars: text.replace(/\s/g, '').length, text, fonts, attachments, images }
}

async function renderGrey(file: string, dir: string, tag: string, pages: number): Promise<Array<{ w: number; h: number; data: Buffer }>> {
  const prefix = join(dir, tag)
  await run('pdftoppm', ['-r', String(RENDER_DPI), '-gray', '-png', '-f', '1', '-l', String(pages), file, prefix], { timeout: TOOL_TIMEOUT_MS })
  const names = (await readdir(dir)).filter((n) => n.startsWith(`${tag}-`) && n.endsWith('.png')).sort()
  const out: Array<{ w: number; h: number; data: Buffer }> = []
  for (const n of names) {
    const r = await sharp(join(dir, n)).greyscale().raw().toBuffer({ resolveWithObject: true })
    out.push({ w: r.info.width, h: r.info.height, data: r.data })
  }
  return out
}

export function popplerTools(): PdfTools {
  return {
    analyze: (pdf) =>
      withDir(async (dir) => {
        const file = join(dir, 'original.pdf')
        await writeFile(file, pdf)
        return probeFile(file)
      }),

    verify: (original, output, before, opts) =>
      withDir(async (dir) => {
        try {
          const outFile = join(dir, 'output.pdf')
          await writeFile(outFile, output)
          const after = await probeFile(outFile)
          if (after.pages !== before.pages) return { ok: false, problem: `pages ${before.pages} -> ${after.pages}` }
          if (after.text !== before.text) return { ok: false, problem: `text layer changed (${before.textChars} -> ${after.textChars} chars)` }
          if (after.fonts !== before.fonts) return { ok: false, problem: 'fonts changed' }
          if (after.attachments !== before.attachments) return { ok: false, problem: 'embedded files changed' }
          if (after.images !== before.images) return { ok: false, problem: `image placements ${before.images} -> ${after.images}` }
          const origFile = join(dir, 'original.pdf')
          await writeFile(origFile, original)
          const n = Math.min(before.pages, RENDER_PAGES)
          const [a, b] = [await renderGrey(origFile, dir, 'a', n), await renderGrey(outFile, dir, 'b', n)]
          if (a.length !== b.length || a.length === 0) return { ok: false, problem: `rendered ${a.length} vs ${b.length} pages` }
          for (let i = 0; i < a.length; i++) {
            const x = a[i]!
            const y = b[i]!
            if (x.w !== y.w || x.h !== y.h) return { ok: false, problem: `page ${i + 1} size ${x.w}x${x.h} -> ${y.w}x${y.h}` }
            const diff = meanAbsDiff(x.data, y.data)
            const limit = opts.exact ? MAX_EXACT_DIFF : MAX_PAGE_DIFF
            if (diff > limit) return { ok: false, problem: `page ${i + 1} looks different (mean grey diff ${diff.toFixed(opts.exact ? 3 : 1)})` }
          }
          return { ok: true }
        } catch (err) {
          return { ok: false, problem: `poppler could not read the output: ${err instanceof Error ? err.message.split('\n')[0]!.slice(0, 80) : 'error'}` }
        }
      }),
  }
}
