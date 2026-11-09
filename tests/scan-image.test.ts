import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  compressReceiptImage, heicPixels, isHeic, isPlainJpeg, MAX_HEIC_PIXELS, ScanImageError,
} from '@/lib/scan/image'
import { SCAN_IMAGE_TARGET_BYTES, scanTargetSize } from '@/lib/scan/model'

// What every photo goes through before the OCR and before Storage: ONE upright image, at most 1600px on
// its long side (a tall receipt keeps a readable width), with no metadata, contrast-stretched — a
// progressive JPEG of at most ~300KB. The HEIC fixture is a 96×64 synthetic gradient — no person, no
// document — so it can live in a public repo.

const HEIC = readFileSync(join(__dirname, 'fixtures', 'synthetic-96x64.heic'))

/** A photographic-looking test picture: noise on a base colour, so it does not compress to nothing. */
async function noisyJpeg(w: number, h: number, opts: { sigma?: number; mean?: number } = {}): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: opts.mean ?? 128, sigma: opts.sigma ?? 6 } },
  }).jpeg({ quality: 92 }).toBuffer()
}

async function jpegWithExif(w: number, h: number, orientation: number): Promise<Buffer> {
  // withExif() cannot set the orientation tag (sharp pins it to 1); withMetadata can.
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .jpeg()
    .withExif({ IFD0: { Make: 'TestPhone' }, IFD3: { GPSLatitudeRef: 'N' } })
    .withMetadata({ orientation })
    .toBuffer()
  // The strip test below is only meaningful if the input really carries both.
  const meta = await sharp(buf).metadata()
  if (meta.orientation !== orientation || !buf.includes(Buffer.from('TestPhone'))) throw new Error('test fixture lost its EXIF')
  return buf
}

describe('compressReceiptImage — the stored form', () => {
  it('weighs at most 300KB for an ordinary receipt photo and is a progressive JPEG', async () => {
    const photo = await noisyJpeg(2000, 1500, { sigma: 3 })
    const out = await compressReceiptImage(photo)
    expect(out.bytes.length).toBeLessThanOrEqual(SCAN_IMAGE_TARGET_BYTES)
    expect(out.contentType).toBe('image/jpeg')
    expect(out.ext).toBe('jpg')
    const meta = await sharp(out.bytes).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.isProgressive).toBe(true)
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1600)
  })

  it('carries no EXIF / GPS / ICC: not in the metadata and not as bytes', async () => {
    const out = await compressReceiptImage(await jpegWithExif(800, 600, 1))
    const meta = await sharp(out.bytes).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.icc).toBeUndefined()
    expect(out.bytes.includes(Buffer.from('TestPhone'))).toBe(false)
    expect(out.bytes.includes(Buffer.from('Exif'))).toBe(false)
  })

  it('applies the EXIF orientation (a phone held sideways ends up upright)', async () => {
    const out = await compressReceiptImage(await jpegWithExif(800, 600, 6)) // 6 = rotate 90° CW
    const meta = await sharp(out.bytes).metadata()
    expect([meta.width, meta.height]).toEqual([600, 800])
    expect(meta.orientation).toBeUndefined()
  })

  it('never enlarges a small photo', async () => {
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#aaaaaa' } }).png().toBuffer()
    const out = await compressReceiptImage(small)
    expect([out.width, out.height]).toEqual([300, 200])
  })

  it('shrinks a normal 4:3 photo so its long side is 1600px', async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#336699' } }).jpeg().toBuffer()
    const out = await compressReceiptImage(big)
    expect([out.width, out.height]).toEqual([1600, 1200])
  })

  it('a tall, narrow supermarket receipt keeps a readable width instead of becoming a 270px strip', async () => {
    const strip = await sharp({ create: { width: 1200, height: 7200, channels: 3, background: '#f4f4f4' } }).jpeg().toBuffer()
    const out = await compressReceiptImage(strip)
    expect(out.height).toBe(4000) // long side capped at 2.5 × 1600
    expect(out.width).toBeGreaterThanOrEqual(660) // 1200 × (4000 / 7200)
    expect(scanTargetSize(1200, 7200, 1600)).toEqual({ w: 667, h: 4000 })
  })

  it('a faded thermal print (a narrow band of greys) is contrast-stretched', async () => {
    // Text-like stripes between grey 170 and 215 — what a faded thermal receipt looks like to a sensor.
    const w = 600
    const h = 400
    const raw = Buffer.alloc(w * h * 3)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = Math.floor(y / 10) % 2 === 0 ? 215 : 170
      raw.fill(v, (y * w + x) * 3, (y * w + x) * 3 + 3)
    }
    const faded = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer()
    const before = (await sharp(faded).greyscale().stats()).channels[0]!
    const out = await compressReceiptImage(faded)
    const after = (await sharp(out.bytes).greyscale().stats()).channels[0]!
    expect(before.max - before.min).toBeLessThan(80)
    expect(after.max - after.min).toBeGreaterThan(180)
  })

  it('never goes below quality 64 or 1280px, even when the floor is heavier than 300KB — and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const out = await compressReceiptImage(await noisyJpeg(2400, 1800, { sigma: 120 }))
    expect(out.quality).toBe(64)
    expect(Math.max(out.width, out.height)).toBe(1280)
    expect(out.bytes.length).toBeGreaterThan(SCAN_IMAGE_TARGET_BYTES) // readability beats weight: the floor is kept
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('a photo that is already final is stored AS IT CAME (one encode, not two)', async () => {
    const first = await compressReceiptImage(await noisyJpeg(1200, 900, { sigma: 2 }))
    expect(first.quality).not.toBeNull()
    expect(isPlainJpeg(first.bytes)).toBe(true)
    const again = await compressReceiptImage(first.bytes)
    expect(again.quality).toBeNull()
    expect(again.bytes.equals(first.bytes)).toBe(true)
  })

  it('a "final" photo with EXIF, bytes after the EOI, or a baseline frame goes through the full pipeline instead', async () => {
    const final = (await compressReceiptImage(await noisyJpeg(1200, 900, { sigma: 2 }))).bytes

    const tailed = Buffer.concat([final, Buffer.from('PAYLOAD-AFTER-EOI')])
    const a = await compressReceiptImage(tailed)
    expect(a.quality).not.toBeNull()
    expect(a.bytes.includes(Buffer.from('PAYLOAD'))).toBe(false)

    const withExif = await sharp(final).withExif({ IFD0: { Make: 'Camera' } }).jpeg({ progressive: true }).toBuffer()
    expect(isPlainJpeg(withExif)).toBe(false)
    const b = await compressReceiptImage(withExif)
    expect(b.bytes.includes(Buffer.from('Camera'))).toBe(false)

    const baseline = await sharp(final).jpeg({ progressive: false }).toBuffer()
    expect(isPlainJpeg(baseline)).toBe(false)
    expect((await compressReceiptImage(baseline)).quality).not.toBeNull()
  })

  it('refuses an empty upload, a non-image, and a truncated JPEG with typed errors', async () => {
    await expect(compressReceiptImage(Buffer.alloc(0))).rejects.toMatchObject({ code: 'empty' })
    await expect(compressReceiptImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).rejects.toBeInstanceOf(ScanImageError)
    const good = await noisyJpeg(800, 600)
    await expect(compressReceiptImage(good.subarray(0, 600))).rejects.toBeInstanceOf(ScanImageError)
  })

  it('refuses a forged huge picture (a few KB on the wire, hundreds of MB decoded) as too_large, before decoding it', async () => {
    const huge = await sharp({ create: { width: 9000, height: 7000, channels: 3, background: '#ffffff' } }).png({ compressionLevel: 9 }).toBuffer() // 63MP
    expect(huge.length).toBeLessThan(200 * 1024)
    await expect(compressReceiptImage(huge)).rejects.toMatchObject({ code: 'too_large' })
    const ok = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: '#eeeeee' } }).jpeg().toBuffer() // 42MP: a phone sensor sent whole
    expect((await compressReceiptImage(ok)).width).toBeGreaterThan(0)
  })

  it('refuses SVG and GIF even though sharp can open them', async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).gif().toBuffer()
    await expect(compressReceiptImage(gif)).rejects.toMatchObject({ code: 'unsupported' })
  })
})

describe('HEIC', () => {
  it('recognises a HEIC by its ftyp brand, not by name', () => {
    expect(isHeic(HEIC)).toBe(true)
    expect(isHeic(Buffer.from('not an image at all, just text'))).toBe(false)
  })

  it('reads the declared size from the box tree', () => {
    expect(heicPixels(HEIC)).toBe(96 * 64)
  })

  it('decodes a real HEIC into the same stored form (heic-convert → sharp)', async () => {
    const out = await compressReceiptImage(HEIC)
    const meta = await sharp(out.bytes).metadata()
    expect(meta.format).toBe('jpeg')
    expect([meta.width, meta.height]).toEqual([96, 64])
    expect(isPlainJpeg(out.bytes)).toBe(true)
  })

  it('refuses a HEIC whose header declares more than 25 megapixels BEFORE decoding it', async () => {
    // Forge the ispe box of the fixture: a 8000×4000 claim (32MP).
    const forged = Buffer.from(HEIC)
    const at = forged.indexOf(Buffer.from('ispe'))
    expect(at).toBeGreaterThan(0)
    forged.writeUInt32BE(8000, at + 8)
    forged.writeUInt32BE(4000, at + 12)
    expect(heicPixels(forged)).toBeGreaterThan(MAX_HEIC_PIXELS)
    await expect(compressReceiptImage(forged)).rejects.toMatchObject({ code: 'too_large' })
  })
})
