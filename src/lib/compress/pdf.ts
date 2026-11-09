import { deflateSync, inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, type PDFObject, type PDFRef } from 'pdf-lib'
import { MAX_INPUT_PIXELS } from './decision'

// The PDF engine. It touches ONLY two things, and never the page content, the fonts or the text layer:
//   1. the file's structure — saved again with compressed object / cross-reference streams (lossless);
//   2. for scanned PDFs, the image XObjects that are sharper than `imageDpi` — brought down to that resolution.
// Everything else (content streams, fonts, ToUnicode maps, annotations, metadata) is carried over as it is,
// which is why the text layer cannot change — the integrity check (pdf-verify.ts) proves it per file anyway.
//
// WHY NOT ghostscript / qpdf: neither is installed on the VPS (installing a system package is Ronen's call),
// and ghostscript re-embeds every font and rewrites every content stream, which is the opposite of
// "the text layer stays exactly as it is". WHY NOT mupdf.js: AGPL, ~14MB of WASM, and no image-resampling API.
//
// A digitally signed PDF is never opened here (`isSignedPdf`): any rewrite invalidates the signature.

export class PdfSkipError extends Error {
  constructor(readonly reason: 'signed-pdf' | 'encrypted-pdf' | 'pdfa-1') {
    super(reason)
    this.name = 'PdfSkipError'
  }
}

/** True when the file carries a digital signature (a signature dictionary always spells out `/ByteRange [`).
 *  Over-matching is the safe direction: a false positive only means the file is left untouched. */
export function isSignedPdf(buf: Uint8Array): boolean {
  return /\/ByteRange\s*\[/.test(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString('latin1'))
}

/** True when the file claims PDF/A-1 conformance in its XMP metadata. PDF/A-1 forbids object streams, which a
 *  rewrite writes, so the file would silently stop being the archival format it says it is. */
export function isPdfA1(buf: Uint8Array): boolean {
  return /pdfaid:part(?:>\s*|\s*=\s*["'])1\b/.test(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString('latin1'))
}

const N = (s: string) => PDFName.of(s)
const nameOf = (o: PDFObject | undefined): string | null => (o instanceof PDFName ? o.decodeText() : null)
const numOf = (o: PDFObject | undefined): number | null => (o instanceof PDFNumber ? o.asNumber() : null)

// ── PNG row filters (what /Predictor 10–15 means inside a Flate stream) ────────────────────────────

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Undoes PNG row filtering. `data` is rows of [filter byte, rowBytes bytes]; `bpp` is bytes per pixel. */
export function unpredictPng(data: Uint8Array, rowBytes: number, bpp: number): Uint8Array {
  const stride = rowBytes + 1
  if (rowBytes <= 0 || data.length % stride !== 0) throw new Error('png_predictor_size')
  const rows = data.length / stride
  const out = new Uint8Array(rows * rowBytes)
  for (let r = 0; r < rows; r++) {
    const filter = data[r * stride] ?? 0
    const src = r * stride + 1
    const dst = r * rowBytes
    const up = dst - rowBytes
    for (let i = 0; i < rowBytes; i++) {
      const x = data[src + i] ?? 0
      const a = i >= bpp ? (out[dst + i - bpp] ?? 0) : 0
      const b = r > 0 ? (out[up + i] ?? 0) : 0
      const c = r > 0 && i >= bpp ? (out[up + i - bpp] ?? 0) : 0
      let v: number
      switch (filter) {
        case 0: v = x; break
        case 1: v = x + a; break
        case 2: v = x + b; break
        case 3: v = x + ((a + b) >> 1); break
        case 4: v = x + paeth(a, b, c); break
        default: throw new Error('png_predictor_filter')
      }
      out[dst + i] = v & 0xff
    }
  }
  return out
}

/** PNG row filtering with the usual "smallest sum of absolute values" heuristic per row. */
export function predictPng(raw: Uint8Array, rowBytes: number, bpp: number): Buffer {
  if (rowBytes <= 0 || raw.length % rowBytes !== 0) throw new Error('png_predictor_size')
  const rows = raw.length / rowBytes
  const out = Buffer.allocUnsafe(rows * (rowBytes + 1))
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(rowBytes))
  for (let r = 0; r < rows; r++) {
    const at = r * rowBytes
    const up = at - rowBytes
    const score = [0, 0, 0, 0, 0]
    for (let i = 0; i < rowBytes; i++) {
      const x = raw[at + i] ?? 0
      const a = i >= bpp ? (raw[at + i - bpp] ?? 0) : 0
      const b = r > 0 ? (raw[up + i] ?? 0) : 0
      const c = r > 0 && i >= bpp ? (raw[up + i - bpp] ?? 0) : 0
      const f = [x, x - a, x - b, x - ((a + b) >> 1), x - paeth(a, b, c)]
      for (let k = 0; k < 5; k++) {
        const v = f[k]! & 0xff
        cand[k]![i] = v
        score[k]! += v < 128 ? v : 256 - v
      }
    }
    let best = 0
    for (let k = 1; k < 5; k++) if (score[k]! < score[best]!) best = k
    out[r * (rowBytes + 1)] = best
    out.set(cand[best]!, r * (rowBytes + 1) + 1)
  }
  return out
}

// ── Resampling raw 8-bit samples (any channel count, so CMYK and Gray work like RGB) ───────────────

/** Area-average ("box") downscale of w×h×ch interleaved 8-bit samples to nw×nh. Linear in the samples, so an
 *  image with a /Decode array (an inverted CMYK, say) averages to the same picture it would have decoded to. */
export function resampleArea(src: Uint8Array, w: number, h: number, ch: number, nw: number, nh: number): Uint8Array {
  if (nw > w || nh > h) throw new Error('resample_enlarge')
  const xs = w / nw
  const ys = h / nh
  const tmp = new Float32Array(nw * h * ch)
  for (let ox = 0; ox < nw; ox++) {
    const x0 = ox * xs
    const x1 = Math.min(w, (ox + 1) * xs)
    const i0 = Math.floor(x0)
    const i1 = Math.min(w, Math.ceil(x1))
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < ch; c++) {
        let acc = 0
        for (let ix = i0; ix < i1; ix++) acc += (src[(y * w + ix) * ch + c] ?? 0) * (Math.min(ix + 1, x1) - Math.max(ix, x0))
        tmp[(y * nw + ox) * ch + c] = acc / (x1 - x0)
      }
    }
  }
  const out = new Uint8Array(nw * nh * ch)
  for (let oy = 0; oy < nh; oy++) {
    const y0 = oy * ys
    const y1 = Math.min(h, (oy + 1) * ys)
    const j0 = Math.floor(y0)
    const j1 = Math.min(h, Math.ceil(y1))
    for (let x = 0; x < nw; x++) {
      for (let c = 0; c < ch; c++) {
        let acc = 0
        for (let iy = j0; iy < j1; iy++) acc += (tmp[(iy * nw + x) * ch + c] ?? 0) * (Math.min(iy + 1, y1) - Math.max(iy, y0))
        out[(oy * nw + x) * ch + c] = Math.round(acc / (y1 - y0))
      }
    }
  }
  return out
}

// ── Which resolution an image may keep ──────────────────────────────────────────────────────────────

/** The pixel size an image is brought down to, or null when it is already at most `dpi` — judged by the biggest
 *  page of the document, with no need to read the content streams: an image is capped at "the whole page at
 *  `dpi`", so a full-page scan lands at `dpi` and anything smaller than a page is left alone. Conservative by
 *  design: an image drawn smaller than the page keeps MORE than `dpi`, never less. Long/short sides are
 *  matched separately, so a landscape scan on a portrait page is judged the same way. */
export function targetPixels(w: number, h: number, pageLongPt: number, pageShortPt: number, dpi: number): { w: number; h: number } | null {
  const allowLong = Math.ceil((pageLongPt / 72) * dpi)
  const allowShort = Math.ceil((pageShortPt / 72) * dpi)
  const long = Math.max(w, h)
  const short = Math.min(w, h)
  const k = Math.min(1, allowLong / long, allowShort / short)
  if (k >= 0.98) return null // less than 2% fewer pixels: not worth a resample
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

// ── Reading the image dictionaries ─────────────────────────────────────────────────────────────────

type Ctx = PDFDocument['context']

function filterNames(ctx: Ctx, dict: PDFDict): string[] {
  const f = dict.lookup(N('Filter'))
  if (!f) return []
  if (f instanceof PDFName) return [f.decodeText()]
  if (f instanceof PDFArray) return f.asArray().map((x) => nameOf(ctx.lookup(x)) ?? '?')
  return ['?']
}

function channelsOf(dict: PDFDict): number | null {
  const cs = dict.lookup(N('ColorSpace'))
  const plain = nameOf(cs)
  if (plain) return plain === 'DeviceGray' ? 1 : plain === 'DeviceRGB' ? 3 : plain === 'DeviceCMYK' ? 4 : null
  if (!(cs instanceof PDFArray)) return null
  const head = nameOf(cs.lookup(0))
  if (head === 'CalGray') return 1
  if (head === 'CalRGB') return 3
  if (head === 'ICCBased') {
    const profile = cs.lookup(1)
    const n = profile instanceof PDFRawStream ? numOf(profile.dict.lookup(N('N'))) : null
    return n === 1 || n === 3 || n === 4 ? n : null
  }
  return null // Indexed, Separation, DeviceN, Lab, Pattern: left as they are
}

function decodeParmsOf(dict: PDFDict): PDFDict | null | 'complex' {
  const dp = dict.lookup(N('DecodeParms'))
  if (!dp) return null
  if (dp instanceof PDFDict) return dp
  if (dp instanceof PDFArray && dp.size() === 1) {
    const only = dp.lookup(0)
    return only instanceof PDFDict ? only : 'complex'
  }
  return 'complex'
}

/** Inflates a Flate image and undoes its predictor; null when it is not plain 8-bit w×h×ch samples. */
function flateSamples(stream: PDFRawStream, w: number, h: number, ch: number): { ok: true; raw: Uint8Array } | { ok: false; why: string } {
  const dp = decodeParmsOf(stream.dict)
  if (dp === 'complex') return { ok: false, why: 'decode-parms' }
  let data: Uint8Array
  try {
    // Never inflate past what a w×h×ch image (plus one predictor byte per row) can legitimately be: a deflate bomb
    // in an e-mailed PDF must not be allowed to eat the server's memory.
    data = inflateSync(stream.contents, { maxOutputLength: h * (w * ch + 1) + 1 })
  } catch {
    return { ok: false, why: 'corrupt-flate' }
  }
  const predictor = dp ? (numOf(dp.lookup(N('Predictor'))) ?? 1) : 1
  let raw: Uint8Array
  if (predictor === 1) {
    raw = data
  } else if (predictor >= 10) {
    const colors = dp ? (numOf(dp.lookup(N('Colors'))) ?? 1) : 1
    const bpc = dp ? (numOf(dp.lookup(N('BitsPerComponent'))) ?? 8) : 8
    const columns = dp ? (numOf(dp.lookup(N('Columns'))) ?? 1) : 1
    if (colors !== ch || bpc !== 8 || columns !== w) return { ok: false, why: 'predictor-params' }
    try {
      raw = unpredictPng(data, w * ch, ch)
    } catch {
      return { ok: false, why: 'predictor-data' }
    }
  } else {
    return { ok: false, why: 'tiff-predictor' }
  }
  return raw.length === w * h * ch ? { ok: true, raw } : { ok: false, why: 'size-mismatch' }
}

// ── The engine ─────────────────────────────────────────────────────────────────────────────────────

export interface PdfFactsFromLib {
  pages: number
  imageCount: number
  imageBytes: number
}

export interface PdfEngineOptions {
  /** Cap the resolution of image XObjects at this; null = structure only (lossless). */
  imageDpi: number | null
}

export interface PdfEngineResult {
  bytes: Buffer
  /** When images were processed: the same document saved WITHOUT touching any image. It lets the verifier hold
   *  pdf-lib's own rewrite to an exact standard and judge the image change separately. null when `bytes` already is that. */
  structuralBytes: Buffer | null
  imagesTotal: number
  imagesResampled: number
  /** Why each image that was NOT resampled was left alone → how many. */
  imagesLeft: Record<string, number>
}

/** Flate samples (w×h×channels) past which an image is left alone rather than resampled in memory. */
const MAX_FLATE_SAMPLES = 150_000_000
const JPEG_QUALITY = 78
/** A re-encoded image replaces the old one only when it is at least this much smaller. */
const IMAGE_KEEP_RATIO = 0.9

export interface OpenedPdf {
  facts: PdfFactsFromLib
  compress(opts: PdfEngineOptions): Promise<PdfEngineResult>
}

/** Parses the file. Throws PdfSkipError for a signed or encrypted file — nothing is ever rewritten for those.
 *  `allowSigned` exists ONLY for the dry run's "what would a signed file have saved" estimate: the output of
 *  such a run is measured and thrown away, never uploaded (the decision for a signed file is always skip). */
export async function openPdf(input: Buffer, opts: { allowSigned?: boolean } = {}): Promise<OpenedPdf> {
  if (isSignedPdf(input) && !opts.allowSigned) throw new PdfSkipError('signed-pdf')
  let doc: PDFDocument
  if (isPdfA1(input)) throw new PdfSkipError('pdfa-1')
  try {
    // throwOnInvalidObject: true = fail closed on an object pdf-lib cannot parse (it would otherwise skip it silently).
    doc = await PDFDocument.load(input, { throwOnInvalidObject: true, updateMetadata: false })
  } catch (err) {
    if (err instanceof Error && (err.name === 'EncryptedPDFError' || /encrypted/i.test(err.message))) throw new PdfSkipError('encrypted-pdf')
    throw err
  }
  const ctx = doc.context
  const images: Array<[PDFRef, PDFRawStream]> = []
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && nameOf(obj.dict.get(N('Subtype'))) === 'Image') images.push([ref, obj])
  }
  const facts: PdfFactsFromLib = {
    pages: doc.getPageCount(),
    imageCount: images.length,
    imageBytes: images.reduce((s, [, st]) => s + st.contents.length, 0),
  }

  async function compress(opts: PdfEngineOptions): Promise<PdfEngineResult> {
    const result: PdfEngineResult = { bytes: Buffer.alloc(0), structuralBytes: null, imagesTotal: images.length, imagesResampled: 0, imagesLeft: {} }
    const save = async () => Buffer.from(await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false }))
    const left = (why: string) => {
      result.imagesLeft[why] = (result.imagesLeft[why] ?? 0) + 1
    }

    if (opts.imageDpi !== null) {
      result.structuralBytes = await save() // BEFORE any image is changed
      let longPt = 0
      let shortPt = 0
      for (const page of doc.getPages()) {
        const box = page.getMediaBox()
        longPt = Math.max(longPt, Math.max(box.width, box.height))
        shortPt = Math.max(shortPt, Math.min(box.width, box.height))
      }
      for (const [ref, stream] of images) {
        const dict = stream.dict
        const w = numOf(dict.lookup(N('Width'))) ?? 0
        const h = numOf(dict.lookup(N('Height'))) ?? 0
        if (w <= 0 || h <= 0 || longPt <= 0) { left('no-dimensions'); continue }
        if (dict.lookup(N('ImageMask'))?.toString() === 'true') { left('image-mask'); continue }
        if (dict.has(N('Mask'))) { left('mask'); continue }
        if (dict.has(N('Matte'))) { left('matte'); continue } // a premultiplied soft mask must keep exactly its parent's size
        const smask = dict.lookup(N('SMask'))
        if (smask instanceof PDFRawStream && smask.dict.has(N('Matte'))) { left('smask-matte'); continue }
        if (numOf(dict.lookup(N('BitsPerComponent'))) !== 8) { left('not-8-bit'); continue }
        const ch = channelsOf(dict)
        if (ch === null) { left('colorspace'); continue }
        const target = targetPixels(w, h, longPt, shortPt, opts.imageDpi)
        if (!target) { left('already-within-dpi'); continue }
        const filters = filterNames(ctx, dict)

        if (filters.length === 1 && filters[0] === 'DCTDecode') {
          if (ch === 4) { left('cmyk-jpeg'); continue }
          if (dict.has(N('Decode'))) { left('jpeg-decode-array'); continue }
          if (dict.has(N('DecodeParms'))) { left('jpeg-decode-parms'); continue } // e.g. /ColorTransform: the new JPEG is always YCbCr
          let out: { data: Buffer; width: number; height: number } | null = null
          try {
            const meta = await sharp(stream.contents, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).metadata()
            if (meta.channels === ch && meta.width === w && meta.height === h) {
              const enc = await sharp(stream.contents, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
                .resize({ width: target.w, height: target.h, fit: 'fill', kernel: 'lanczos3' })
                .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: false })
                .toBuffer({ resolveWithObject: true })
              if (enc.info.channels === ch) out = { data: enc.data, width: enc.info.width, height: enc.info.height }
            }
          } catch {
            out = null
          }
          if (!out) { left('jpeg-undecodable'); continue }
          if (out.data.length >= stream.contents.length * IMAGE_KEEP_RATIO) { left('not-smaller'); continue }
          dict.set(N('Width'), PDFNumber.of(out.width))
          dict.set(N('Height'), PDFNumber.of(out.height))
          ctx.assign(ref, PDFRawStream.of(dict, out.data))
          result.imagesResampled++
          continue
        }

        if (filters.length === 1 && filters[0] === 'FlateDecode') {
          if (w * h * ch > MAX_FLATE_SAMPLES) { left('too-large'); continue }
          const samples = flateSamples(stream, w, h, ch)
          if (!samples.ok) { left(samples.why); continue }
          const small = resampleArea(samples.raw, w, h, ch, target.w, target.h)
          const packed = deflateSync(predictPng(small, target.w * ch, ch), { level: 9 })
          if (packed.length >= stream.contents.length * IMAGE_KEEP_RATIO) { left('not-smaller'); continue }
          dict.set(N('Width'), PDFNumber.of(target.w))
          dict.set(N('Height'), PDFNumber.of(target.h))
          dict.set(N('Filter'), N('FlateDecode'))
          dict.set(N('DecodeParms'), ctx.obj({ Predictor: 15, Colors: ch, BitsPerComponent: 8, Columns: target.w }))
          ctx.assign(ref, PDFRawStream.of(dict, packed))
          result.imagesResampled++
          continue
        }
        left(`filter:${filters.join('+') || 'none'}`)
      }
    }

    result.bytes = result.imagesResampled === 0 && result.structuralBytes ? result.structuralBytes : await save()
    if (result.imagesResampled === 0) result.structuralBytes = null // `bytes` IS the structural rewrite
    return result
  }

  return { facts, compress }
}
