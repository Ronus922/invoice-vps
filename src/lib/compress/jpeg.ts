import sharp from 'sharp'
import { SCAN_IMAGE_FALLBACK_SIDE, SCAN_IMAGE_MAX_SIDE, SCAN_IMAGE_QUALITIES, scanTargetSize } from '../scan/model'
import { IMAGE_TARGET_BYTES, MAX_INPUT_PIXELS } from './decision'

// Retroactive re-encode of a JPEG already in the bucket. Same ladder as the live scan pipeline
// (src/lib/scan/image.ts: qualities 82 → 64, sizes 1600 → 1280, target ~300KB), with three differences
// that come from this being an OLD ACCOUNTING DOCUMENT and not a fresh photo:
//   · no contrast stretch — the document must look the way it did;
//   · the first rung keeps the picture's own resolution (capped at the 2048px the browser upload already
//     used), so quality alone is tried before any pixel is thrown away;
//   · a file already at or under the target is left alone — re-encoding a JPEG costs quality for nothing.
// Format stays JPEG and so does the extension: the stored path, file_name and Content-Type do not change.

/** The browser upload (src/lib/upload.ts) already capped photos at this; the first rung is never above it. */
const UPLOAD_MAX_SIDE = 2048

export interface JpegResult {
  bytes: Buffer
  width: number
  height: number
  quality: number
}

interface Oriented {
  w: number
  h: number
}

/** Pixel size AFTER the EXIF turn is applied (orientation 5–8 trade width and height). */
async function orientedSize(input: Buffer): Promise<Oriented> {
  const meta = await sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).metadata()
  const swap = (meta.orientation ?? 1) >= 5
  const w = (swap ? meta.height : meta.width) ?? 0
  const h = (swap ? meta.width : meta.height) ?? 0
  return { w, h }
}

/** The sizes tried, in order: the picture's own (≤2048px), then 1600px, then 1280px — each only if it is
 *  actually smaller than the one before. */
export function ladderSizes(w: number, h: number): Oriented[] {
  const rungs = [UPLOAD_MAX_SIDE, SCAN_IMAGE_MAX_SIDE, SCAN_IMAGE_FALLBACK_SIDE].map((side) => scanTargetSize(w, h, side))
  const out: Oriented[] = []
  for (const r of rungs) {
    const last = out[out.length - 1]
    if (!last || r.w < last.w || r.h < last.h) out.push({ w: r.w, h: r.h })
  }
  return out
}

/** Re-encodes `input` down the ladder and returns the first result at or under the target, or the lightest
 *  rung when none gets there. Returns null when the file needs nothing (already within the target). */
export async function recompressJpeg(input: Buffer, targetBytes: number = IMAGE_TARGET_BYTES): Promise<JpegResult | null> {
  if (input.length <= targetBytes) return null
  const { w, h } = await orientedSize(input)
  if (w <= 0 || h <= 0) throw new Error('jpeg_no_dimensions')

  let lightest: JpegResult | null = null
  for (const size of ladderSizes(w, h)) {
    const base = sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
      .rotate() // applies the EXIF turn and drops the tag: upright for every viewer
      .resize({ width: size.w, height: size.h, fit: 'fill' })
      .flatten({ background: '#ffffff' })
    for (const quality of SCAN_IMAGE_QUALITIES) {
      const out = await base.clone().jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer({ resolveWithObject: true })
      const r: JpegResult = { bytes: out.data, width: out.info.width, height: out.info.height, quality }
      if (!lightest || r.bytes.length < lightest.bytes.length) lightest = r
      if (r.bytes.length <= targetBytes) return r
    }
  }
  return lightest
}

export interface IntegrityVerdict {
  ok: boolean
  problem?: string
}

/** Pixels per side of the grey thumbnail two pictures are compared on. */
const THUMB = 96
/** Mean absolute grey difference (0–255) above which two pictures are not "the same picture". Measured on the 92
 *  real JPEGs over 300KB: the worst re-encode is 1.4; this leaves a margin of 4×. */
export const MAX_THUMB_DIFF = 6
/** A mean over the whole page hides a blank output when the original is mostly white paper (5% ink moves the mean by
 *  ~11): so the share of DARK pixels (ink) is compared as well, and may differ by at most this fraction
 *  (real worst case: 0.0028). */
export const MAX_INK_DELTA = 0.008
const INK_BELOW = 128
/** Aspect ratios may differ by this much (rounding of the new size). */
const MAX_ASPECT_DRIFT = 0.015

export async function thumb(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: THUMB, height: THUMB, fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer()
}

/** Mean absolute difference of two equal-length 8-bit buffers. */
export function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 255
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0))
  return sum / a.length
}

export const inkShare = (grey: Uint8Array): number => {
  let dark = 0
  for (const v of grey) if (v < INK_BELOW) dark++
  return grey.length ? dark / grey.length : 0
}

/** How far apart two pictures are on their grey thumbnails: the mean difference and the difference in ink share. */
export async function compareThumbs(before: Buffer, after: Buffer): Promise<{ diff: number; inkDelta: number }> {
  const [a, b] = [await thumb(before), await thumb(after)]
  return { diff: meanAbsDiff(a, b), inkDelta: Math.abs(inkShare(a) - inkShare(b)) }
}

/** "The output opens, is the same picture, has the same shape." Decodes the output END TO END (not just its
 *  header), compares its aspect ratio with the original's upright size, and compares 64×64 grey thumbnails. */
export async function verifyJpeg(before: Buffer, after: Buffer): Promise<IntegrityVerdict> {
  try {
    const o = await orientedSize(before)
    await sharp(after, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).stats() // forces a full decode
    const meta = await sharp(after, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).metadata()
    if (meta.format !== 'jpeg') return { ok: false, problem: `output is ${meta.format ?? 'unknown'}, not jpeg` }
    const nw = meta.width ?? 0
    const nh = meta.height ?? 0
    if (nw <= 0 || nh <= 0 || o.w <= 0 || o.h <= 0) return { ok: false, problem: 'missing dimensions' }
    if (Math.abs(nw / nh - o.w / o.h) / (o.w / o.h) > MAX_ASPECT_DRIFT) return { ok: false, problem: `aspect changed ${o.w}x${o.h} -> ${nw}x${nh}` }
    const { diff, inkDelta } = await compareThumbs(before, after)
    if (diff > MAX_THUMB_DIFF) return { ok: false, problem: `picture differs (mean grey diff ${diff.toFixed(1)})` }
    if (inkDelta > MAX_INK_DELTA) return { ok: false, problem: `ink differs (${(inkDelta * 100).toFixed(1)}% of the page)` }
    return { ok: true }
  } catch (err) {
    return { ok: false, problem: `does not decode: ${err instanceof Error ? err.message.slice(0, 80) : 'error'}` }
  }
}
