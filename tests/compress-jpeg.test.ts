import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { IMAGE_TARGET_BYTES } from '@/lib/compress/decision'
import { ladderSizes, meanAbsDiff, recompressJpeg, verifyJpeg } from '@/lib/compress/jpeg'
import { jpegPhoto } from './compress-fixtures'

describe('ladderSizes — the sizes tried, never enlarging', () => {
  it('a big photo: its own size capped at 2048px, then 1600px, then 1280px', () => {
    expect(ladderSizes(3000, 2000)).toEqual([{ w: 2048, h: 1365 }, { w: 1600, h: 1067 }, { w: 1280, h: 853 }])
  })
  it('a photo already under a rung has no duplicate rung for it', () => {
    expect(ladderSizes(1500, 1000)).toEqual([{ w: 1500, h: 1000 }, { w: 1280, h: 853 }])
    expect(ladderSizes(900, 600)).toEqual([{ w: 900, h: 600 }])
  })
  it('never produces a size larger than the picture, whatever its shape', () => {
    for (const [w, h] of [[600, 3000], [3000, 600], [5000, 5000], [200, 100]] as const) {
      for (const r of ladderSizes(w, h)) expect(r.w <= w && r.h <= h).toBe(true)
    }
  })
})

describe('recompressJpeg', () => {
  it('a file already at or under the target is left alone (null) — no generation loss for nothing', async () => {
    const small = await jpegPhoto(600, 400, { noise: 2, quality: 70 })
    expect(small.length).toBeLessThanOrEqual(IMAGE_TARGET_BYTES)
    expect(await recompressJpeg(small)).toBeNull()
  })

  it('a heavy photo comes out at or under 300KB, as a JPEG, with no metadata, and passes its own integrity check', async () => {
    const heavy = await jpegPhoto(2400, 1600, { noise: 14, quality: 95 })
    expect(heavy.length).toBeGreaterThan(IMAGE_TARGET_BYTES * 2)
    const r = await recompressJpeg(heavy)
    expect(r).not.toBeNull()
    expect(r!.bytes.length).toBeLessThanOrEqual(IMAGE_TARGET_BYTES)
    const meta = await sharp(r!.bytes).metadata()
    expect(meta).toMatchObject({ format: 'jpeg', width: r!.width, height: r!.height, isProgressive: true })
    expect(meta.exif).toBeUndefined()
    expect(meta.icc).toBeUndefined()
    expect(await verifyJpeg(heavy, r!.bytes)).toEqual({ ok: true })
  })

  it('tries quality BEFORE throwing pixels away: a picture that fits at a lower quality keeps its own resolution', async () => {
    const photo = await jpegPhoto(1600, 1000, { noise: 6, quality: 98 })
    expect(photo.length).toBeGreaterThan(IMAGE_TARGET_BYTES)
    const r = await recompressJpeg(photo)
    expect(r!.bytes.length).toBeLessThanOrEqual(IMAGE_TARGET_BYTES)
    expect(r!.width).toBe(1600)
  })

  it('applies the EXIF turn: a photo stored sideways and flagged "rotate 90°" comes out upright, and still verifies', async () => {
    const sideways = await jpegPhoto(2000, 1300, { noise: 12, quality: 95, orientation: 6 })
    const r = await recompressJpeg(sideways)
    expect(r!.height).toBeGreaterThan(r!.width) // displayed portrait
    expect((await sharp(r!.bytes).metadata()).orientation).toBeUndefined() // tag gone: nothing left to be applied twice
    expect(await verifyJpeg(sideways, r!.bytes)).toEqual({ ok: true })
  })

  it('a floor that is still over the target is returned anyway (readability comes before weight), never smaller than 1280px', async () => {
    const grain = await jpegPhoto(1800, 1200, { noise: 120, quality: 95 }) // near-incompressible
    const r = await recompressJpeg(grain, 20_000)
    expect(r).not.toBeNull()
    expect(r!.bytes.length).toBeGreaterThan(20_000)
    expect(r!.width).toBeGreaterThanOrEqual(1280)
    expect(r!.quality).toBe(64)
  })

  it('rejects input that is not an image', async () => {
    await expect(recompressJpeg(Buffer.alloc(400_000, 7))).rejects.toThrow()
  })
})

describe('verifyJpeg — "same picture, same shape, opens"', () => {
  it('rejects an output that is not a picture of the original: black, a different image, a squashed one', async () => {
    const orig = await jpegPhoto(1200, 800, { noise: 10 })
    const black = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#000' } }).jpeg().toBuffer()
    expect((await verifyJpeg(orig, black)).ok).toBe(false)

    const other = await sharp(await jpegPhoto(1200, 800, { noise: 10 })).negate().jpeg().toBuffer() // inverted colours
    expect((await verifyJpeg(orig, other)).ok).toBe(false)

    const squashed = await sharp(orig).resize(800, 800, { fit: 'fill' }).jpeg().toBuffer()
    expect(await verifyJpeg(orig, squashed)).toMatchObject({ ok: false, problem: expect.stringMatching(/aspect changed/) })
  })
  it('catches a BLANK output for a document that is mostly white paper — what a plain mean difference misses', async () => {
    const white = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
    const band = (h: number) => sharp({ create: { width: 1200, height: h, channels: 3, background: '#000000' } }).png().toBuffer()
    // ~6% ink, and a faint ~1.2% band (a few lines of text on an otherwise empty page)
    const heavy = await white(1200, 1600).composite([{ input: await band(96), top: 300, left: 0 }]).jpeg({ quality: 90 }).toBuffer()
    const faint = await white(1200, 1600).composite([{ input: await band(19), top: 300, left: 0 }]).jpeg({ quality: 90 }).toBuffer()
    const blank = await white(1200, 1600).jpeg({ quality: 90 }).toBuffer()
    for (const original of [heavy, faint]) {
      expect((await verifyJpeg(original, blank)).ok).toBe(false)
      expect((await verifyJpeg(original, original)).ok).toBe(true)
    }
    expect(await verifyJpeg(faint, blank)).toMatchObject({ problem: expect.stringMatching(/ink differs/) })
  })
  it('rejects an output that is not a JPEG, or does not decode', async () => {
    const orig = await jpegPhoto(1200, 800)
    const png = await sharp(orig).png().toBuffer()
    expect(await verifyJpeg(orig, png)).toMatchObject({ ok: false, problem: expect.stringMatching(/not jpeg/) })
    expect((await verifyJpeg(orig, Buffer.from('definitely not an image'))).ok).toBe(false)
    expect((await verifyJpeg(orig, orig.subarray(0, 4000))).ok).toBe(false) // truncated
  })
  it('accepts a resized, re-encoded copy', async () => {
    const orig = await jpegPhoto(1200, 800, { noise: 10 })
    const small = await sharp(orig).resize(900, 600).jpeg({ quality: 70 }).toBuffer()
    expect(await verifyJpeg(orig, small)).toEqual({ ok: true })
  })
})

describe('meanAbsDiff', () => {
  it('is 0 for equal buffers, the mean gap otherwise, and 255 (worst) for different lengths or empty input', () => {
    expect(meanAbsDiff(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 3]))).toBe(0)
    expect(meanAbsDiff(Uint8Array.from([0, 10]), Uint8Array.from([10, 0]))).toBe(10)
    expect(meanAbsDiff(Uint8Array.from([1]), Uint8Array.from([1, 2]))).toBe(255)
    expect(meanAbsDiff(new Uint8Array(0), new Uint8Array(0))).toBe(255)
  })
})
