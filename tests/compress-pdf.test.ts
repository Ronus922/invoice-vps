import { deflateSync, inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, StandardFonts, type PDFRef } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { PdfSkipError, isPdfA1, isSignedPdf, openPdf, predictPng, resampleArea, targetPixels, unpredictPng } from '@/lib/compress/pdf'
import { popplerStatus, popplerTools } from '@/lib/compress/pdf-verify'
import { meanAbsDiff } from '@/lib/compress/jpeg'
import { a4Pdf, jpegPhoto, pngPhoto, rawPhoto } from './compress-fixtures'

const N = (s: string) => PDFName.of(s)

/** Every image XObject of a PDF: its dictionary facts and decoded stream. */
async function imagesOf(pdf: Buffer) {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false })
  const out: Array<{ ref: PDFRef; w: number; h: number; filter: string; bytes: number; dict: PDFDict; contents: Uint8Array }> = []
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.lookup(N('Subtype'))?.toString() !== '/Image') continue
    out.push({
      ref,
      w: (obj.dict.lookup(N('Width')) as PDFNumber).asNumber(),
      h: (obj.dict.lookup(N('Height')) as PDFNumber).asNumber(),
      filter: obj.dict.lookup(N('Filter'))?.toString() ?? 'none',
      bytes: obj.contents.length,
      dict: obj.dict,
      contents: obj.contents,
    })
  }
  return out
}

describe('PNG predictor — what Flate images in a PDF are packed with', () => {
  it('predictPng then unpredictPng gives back exactly the samples (1, 3 and 4 channels, rows of every filter kind)', () => {
    for (const bpp of [1, 3, 4]) {
      const w = 37
      const h = 29
      const raw = new Uint8Array(Buffer.concat([rawPhoto(w, h, 40, bpp), rawPhoto(w, h, 40, bpp + 7)]).subarray(0, w * h * bpp)) // structured + noisy rows
      const packed = predictPng(raw, w * bpp, bpp)
      expect(packed.length).toBe(h * (w * bpp + 1))
      expect(Buffer.from(unpredictPng(packed, w * bpp, bpp)).equals(Buffer.from(raw))).toBe(true)
    }
  })
  it('unpredictPng refuses data whose length is not a whole number of rows, and unknown filter bytes', () => {
    expect(() => unpredictPng(new Uint8Array(11), 4, 1)).toThrow('png_predictor_size')
    expect(() => unpredictPng(Uint8Array.from([9, 0, 0, 0]), 3, 1)).toThrow('png_predictor_filter')
  })
})

describe('resampleArea — box downscale of raw samples', () => {
  it('a flat colour stays that colour, at any size and channel count', () => {
    for (const ch of [1, 3, 4]) {
      const src = new Uint8Array(90 * 60 * ch).fill(77)
      const out = resampleArea(src, 90, 60, ch, 40, 27)
      expect(out.length).toBe(40 * 27 * ch)
      expect(new Set(out)).toEqual(new Set([77]))
    }
  })
  it('halving averages each 2×2 block (channels kept apart)', () => {
    // 4×2 image, 2 channels
    const src = Uint8Array.from([
      0, 100, 10, 110, 200, 50, 220, 70,
      20, 120, 30, 130, 240, 90, 250, 110,
    ])
    expect(Array.from(resampleArea(src, 4, 2, 2, 2, 1))).toEqual([15, 115, 228, 80])
  })
  it('uses fractional coverage when the ratio is not whole: 3 pixels into 2 weights the middle one half-and-half', () => {
    expect(Array.from(resampleArea(Uint8Array.from([0, 30, 60]), 3, 1, 1, 2, 1))).toEqual([10, 50])
    // (0*1 + 30*0.5)/1.5 = 10 ; (30*0.5 + 60*1)/1.5 = 50 — an unweighted mean of whole pixels would give 15 and 45
    expect(Array.from(resampleArea(Uint8Array.from([0, 30, 60]), 1, 3, 1, 1, 2))).toEqual([10, 50]) // same, vertically
  })
  it('refuses to enlarge', () => {
    expect(() => resampleArea(new Uint8Array(4), 2, 2, 1, 4, 4)).toThrow('resample_enlarge')
  })
})

describe('targetPixels — the 150 dpi cap, judged by the page size', () => {
  const A4 = [842, 595] as const // long, short (points)
  it('a full-page 300 dpi scan comes down to the page at 150 dpi', () => {
    expect(targetPixels(2480, 3508, ...A4, 150)).toEqual({ w: 1240, h: 1754 })
  })
  it('an image already at or under the cap — or less than 2% over — is left alone', () => {
    expect(targetPixels(1240, 1754, ...A4, 150)).toBeNull()
    expect(targetPixels(1000, 1400, ...A4, 150)).toBeNull()
    expect(targetPixels(1250, 1760, ...A4, 150)).toBeNull()
  })
  it('anything smaller than a page (a logo, a stamp) is never touched, however sharp it is', () => {
    expect(targetPixels(600, 300, ...A4, 150)).toBeNull()
  })
  it('a landscape scan on a portrait page is judged by its long side against the page\'s long side', () => {
    expect(targetPixels(3508, 2480, ...A4, 150)).toEqual({ w: 1754, h: 1240 })
  })
  it('never enlarges and never returns a zero side', () => {
    const r = targetPixels(6000, 1, ...A4, 150)
    expect(r!.w).toBeLessThan(6000)
    expect(r!.h).toBeGreaterThanOrEqual(1)
  })
})

describe('isSignedPdf', () => {
  it('sees a signature dictionary, and only that', () => {
    expect(isSignedPdf(Buffer.from('%PDF-1.7\n<< /Type /Sig /ByteRange [0 100 200 300] /Contents <00> >>'))).toBe(true)
    expect(isSignedPdf(Buffer.from('%PDF-1.7\n<< /ByteRange[0 1 2 3] >>'))).toBe(true)
    expect(isSignedPdf(Buffer.from('%PDF-1.7\n<< /Type /Page >>'))).toBe(false)
  })
})

describe('isPdfA1', () => {
  it('sees the XMP claim in both spellings, and only part 1', () => {
    expect(isPdfA1(Buffer.from('<rdf:Description><pdfaid:part>1</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>'))).toBe(true)
    expect(isPdfA1(Buffer.from('<rdf:Description pdfaid:part="1" pdfaid:conformance="B"/>'))).toBe(true)
    expect(isPdfA1(Buffer.from('<pdfaid:part>2</pdfaid:part>'))).toBe(false)
    expect(isPdfA1(Buffer.from('<pdfaid:part>12</pdfaid:part>'))).toBe(false)
    expect(isPdfA1(Buffer.from('%PDF-1.7 nothing about archives'))).toBe(false)
  })
  it('a PDF/A-1 file is refused (object streams would void its conformance)', async () => {
    const pdfa = Buffer.concat([await a4Pdf({ text: 'archive' }), Buffer.from('\n% <pdfaid:part>1</pdfaid:part>\n')])
    await expect(openPdf(pdfa)).rejects.toMatchObject({ reason: 'pdfa-1' })
  })
})

describe('openPdf / compress — the engine on real PDFs', () => {
  it('a signed PDF is refused (the rewrite would void the signature) — unless the dry run asks for the estimate', async () => {
    const signed = Buffer.concat([await a4Pdf({ text: 'signed' }), Buffer.from('\n% /ByteRange [0 1 2 3]\n')])
    await expect(openPdf(signed)).rejects.toMatchObject({ reason: 'signed-pdf' })
    await expect(openPdf(signed)).rejects.toBeInstanceOf(PdfSkipError)
    await expect(openPdf(signed, { allowSigned: true })).resolves.toBeDefined()
  })

  it('a JPEG page scan at 200 dpi is brought to 150 dpi: fewer pixels, a lighter file, same page count', async () => {
    const scan = await a4Pdf({ jpeg: await jpegPhoto(1654, 2339, { noise: 22, quality: 92 }), text: 'Invoice 1234' })
    const opened = await openPdf(scan)
    expect(opened.facts).toMatchObject({ pages: 1, imageCount: 1 })
    const res = await opened.compress({ imageDpi: 150 })

    expect(res.imagesResampled).toBe(1)
    const [img] = await imagesOf(res.bytes)
    expect(img!.filter).toBe('/DCTDecode')
    expect(img!.w).toBeLessThanOrEqual(1240)
    expect(img!.h).toBeLessThanOrEqual(1755)
    expect(res.bytes.length).toBeLessThan(scan.length * 0.8)
    expect((await PDFDocument.load(res.bytes)).getPageCount()).toBe(1)
    // the picture inside is still the picture: decode the new JPEG and compare it with the old one at thumbnail size
    const [old] = await imagesOf(scan)
    const a = await sharp(Buffer.from(old!.contents)).resize(48, 48, { fit: 'fill' }).greyscale().raw().toBuffer()
    const b = await sharp(Buffer.from(img!.contents)).resize(48, 48, { fit: 'fill' }).greyscale().raw().toBuffer()
    expect(meanAbsDiff(a, b)).toBeLessThan(6)
  })

  it('a Flate page scan (PNG-predicted) is downscaled and stays Flate with a valid predictor; the pixels are the box average', async () => {
    const scan = await a4Pdf({ png: await pngPhoto(1654, 2339, 12) })
    const opened = await openPdf(scan)
    expect(opened.facts.imageCount).toBe(1)
    const res = await opened.compress({ imageDpi: 150 })
    expect(res.imagesResampled).toBe(1)

    const [img] = await imagesOf(res.bytes)
    expect(img!.filter).toBe('/FlateDecode')
    const dp = img!.dict.lookup(N('DecodeParms')) as PDFDict
    expect((dp.lookup(N('Predictor')) as PDFNumber).asNumber()).toBe(15)
    expect((dp.lookup(N('Columns')) as PDFNumber).asNumber()).toBe(img!.w)
    const raw = unpredictPng(inflateSync(img!.contents), img!.w * 3, 3)
    expect(raw.length).toBe(img!.w * img!.h * 3)
    // compare with an independent resize of the same source (sharp, area-style kernel)
    const reference = await sharp(rawPhoto(1654, 2339, 12), { raw: { width: 1654, height: 2339, channels: 3 } }).resize(img!.w, img!.h, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer()
    expect(meanAbsDiff(raw, reference)).toBeLessThan(4)
  })

  it('CMYK Flate with a /Decode array is downscaled with the Decode array kept; Indexed, image masks and masked images are left exactly as they are', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([595, 842])
    const ctx = doc.context
    const base = { Type: 'XObject', Subtype: 'Image', Width: 1654, Height: 2339, BitsPerComponent: 8 }
    const cmykData = Buffer.concat([rawPhoto(1654, 2339, 10), Buffer.alloc(1654 * 2339)]) // w*h*4 bytes
    const cmyk = ctx.register(ctx.flateStream(cmykData, { ...base, ColorSpace: 'DeviceCMYK', Decode: [1, 0, 1, 0, 1, 0, 1, 0] }))
    const indexed = ctx.register(ctx.flateStream(Buffer.alloc(1654 * 2339, 3), { ...base, ColorSpace: [N('Indexed'), N('DeviceRGB'), 1, PDFHexString.of('000000FFFFFF')] }))
    const stencil = ctx.register(ctx.flateStream(Buffer.alloc((1654 / 8 + 1) * 2339), { ...base, BitsPerComponent: 1, ImageMask: true }))
    const keyed = ctx.register(ctx.flateStream(Buffer.alloc(1654 * 2339 * 3, 9), { ...base, ColorSpace: 'DeviceRGB', Mask: [0, 5, 0, 5, 0, 5] }))
    const pdf = Buffer.from(await doc.save())
    const before = new Map((await imagesOf(pdf)).map((i) => [i.ref.toString(), i]))

    const res = await (await openPdf(pdf)).compress({ imageDpi: 150 })
    const after = new Map((await imagesOf(res.bytes)).map((i) => [i.ref.toString(), i]))

    expect(res.imagesTotal).toBe(4)
    expect(res.imagesResampled).toBe(1)
    expect(res.imagesLeft).toEqual({ colorspace: 1, 'image-mask': 1, mask: 1 })
    const c = after.get(cmyk.toString())!
    expect(c.w).toBeLessThan(1654)
    expect((c.dict.lookup(N('Decode')) as PDFArray).size()).toBe(8) // inverted CMYK stays inverted
    for (const untouched of [indexed, stencil, keyed]) {
      const b = before.get(untouched.toString())!
      const a = after.get(untouched.toString())!
      expect([a.w, a.h, Buffer.from(a.contents).equals(Buffer.from(b.contents))]).toEqual([b.w, b.h, true])
    }
  })

  it('structure-only mode (the setting for text PDFs) leaves every image stream byte-identical', async () => {
    const pdf = await a4Pdf({ png: await pngPhoto(1654, 2339, 12), text: 'Invoice' })
    const res = await (await openPdf(pdf)).compress({ imageDpi: null })
    expect(res.imagesResampled).toBe(0)
    const [a] = await imagesOf(pdf)
    const [b] = await imagesOf(res.bytes)
    expect(Buffer.from(b!.contents).equals(Buffer.from(a!.contents))).toBe(true)
    expect([b!.w, b!.h]).toEqual([a!.w, a!.h])
  })

  it('an image that would not get lighter is left in place', async () => {
    // 1250×1760 is within 2% of the cap → untouched; 'already-within-dpi'
    const res = await (await openPdf(await a4Pdf({ jpeg: await jpegPhoto(1250, 1760, { noise: 5 }) }))).compress({ imageDpi: 150 })
    expect(res.imagesResampled).toBe(0)
    expect(res.imagesLeft).toEqual({ 'already-within-dpi': 1 })
  })

  it('keeps a structure-only copy alongside when images were resampled, so pdf-lib can be judged on its own', async () => {
    const scan = await a4Pdf({ png: await pngPhoto(1654, 2339, 12) })
    const withImages = await (await openPdf(scan)).compress({ imageDpi: 150 })
    expect(withImages.structuralBytes).not.toBeNull()
    const [orig] = await imagesOf(scan)
    const [structural] = await imagesOf(withImages.structuralBytes!)
    expect(Buffer.from(structural!.contents).equals(Buffer.from(orig!.contents))).toBe(true) // images untouched in it
    const structureOnly = await (await openPdf(scan)).compress({ imageDpi: null })
    expect(structureOnly.structuralBytes).toBeNull() // `bytes` already is the structural rewrite
  })

  it('leaves alone: premultiplied soft masks (/Matte), a JPEG with /DecodeParms, and an image whose soft mask has /Matte', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([595, 842])
    const ctx = doc.context
    const base = { Type: 'XObject', Subtype: 'Image', Width: 1654, Height: 2339, BitsPerComponent: 8 }
    const gray = Buffer.alloc(1654 * 2339, 200)
    const matteMask = ctx.register(ctx.flateStream(gray, { ...base, ColorSpace: 'DeviceGray', Matte: [0, 0, 0] }))
    ctx.register(ctx.flateStream(Buffer.alloc(1654 * 2339 * 3, 7), { ...base, ColorSpace: 'DeviceRGB', SMask: matteMask }))
    const jpg = await jpegPhoto(1654, 2339, { noise: 20 })
    const info = await sharp(jpg).metadata()
    ctx.register(PDFRawStream.of(ctx.obj({ ...base, Width: info.width!, Height: info.height!, ColorSpace: 'DeviceRGB', Filter: 'DCTDecode', DecodeParms: { ColorTransform: 0 } }), jpg))
    const res = await (await openPdf(Buffer.from(await doc.save()))).compress({ imageDpi: 150 })
    expect(res.imagesResampled).toBe(0)
    expect(res.imagesLeft).toEqual({ matte: 1, 'smask-matte': 1, 'jpeg-decode-parms': 1 })
  })

  it('ICC-based (N=3) and CalRGB Flate images are resampled; the colour space dictionary is left exactly as it was', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([595, 842])
    const ctx = doc.context
    const base = { Type: 'XObject', Subtype: 'Image', Width: 1654, Height: 2339, BitsPerComponent: 8 }
    const rgb = rawPhoto(1654, 2339, 6)
    const icc = ctx.register(ctx.flateStream(Buffer.alloc(64), { N: 3, Alternate: 'DeviceRGB' }))
    const iccImg = ctx.register(ctx.flateStream(rgb, { ...base, ColorSpace: [N('ICCBased'), icc] }))
    const calImg = ctx.register(ctx.flateStream(rgb, { ...base, ColorSpace: [N('CalRGB'), ctx.obj({ WhitePoint: [0.95, 1, 1.09] })] }))
    const pdf = Buffer.from(await doc.save())
    const res = await (await openPdf(pdf)).compress({ imageDpi: 150 })
    expect(res.imagesResampled).toBe(2)
    const after = new Map((await imagesOf(res.bytes)).map((i) => [i.ref.toString(), i]))
    for (const ref of [iccImg, calImg]) {
      const img = after.get(ref.toString())!
      expect(img.w).toBeLessThan(1654)
      expect(inflateSync(img.contents).length).toBe(img.h * (img.w * 3 + 1)) // a whole number of predicted rows
    }
    const iccCs = after.get(iccImg.toString())!.dict.lookup(N('ColorSpace')) as PDFArray
    expect(iccCs.lookup(0)?.toString()).toBe('/ICCBased')
  })

  it('a Flate image that is not plain 8-bit samples is left alone with the reason: TIFF predictor, corrupt data, wrong length, predictor parameters that do not match, a deflate bomb', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([595, 842])
    const ctx = doc.context
    const base = { Type: 'XObject', Subtype: 'Image', Width: 1654, Height: 2339, BitsPerComponent: 8, ColorSpace: 'DeviceRGB' }
    const n = 1654 * 2339 * 3
    ctx.register(PDFRawStream.of(ctx.obj({ ...base, Filter: 'FlateDecode', DecodeParms: { Predictor: 2, Colors: 3, BitsPerComponent: 8, Columns: 1654 } }), deflateSync(Buffer.alloc(n))))
    ctx.register(PDFRawStream.of(ctx.obj({ ...base, Filter: 'FlateDecode' }), Buffer.from('this is not zlib data')))
    ctx.register(PDFRawStream.of(ctx.obj({ ...base, Filter: 'FlateDecode' }), deflateSync(Buffer.alloc(n - 7))))
    ctx.register(PDFRawStream.of(ctx.obj({ ...base, Filter: 'FlateDecode', DecodeParms: { Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: 999 } }), deflateSync(Buffer.alloc(n))))
    ctx.register(PDFRawStream.of(ctx.obj({ ...base, Filter: 'FlateDecode' }), deflateSync(Buffer.alloc(60_000_000)))) // 60MB of zeros claimed as an 11MB image
    const res = await (await openPdf(Buffer.from(await doc.save()))).compress({ imageDpi: 150 })
    expect(res.imagesResampled).toBe(0)
    expect(res.imagesLeft).toEqual({ 'tiff-predictor': 1, 'corrupt-flate': 2, 'size-mismatch': 1, 'predictor-params': 1 })
  })

  it('an image whose re-encoded form would not be lighter is left in place (not-smaller), and it says so', async () => {
    // a JPEG saved at quality 5 is tiny; the engine re-encodes at 78, which at 56% of the pixels is still heavier
    const scan = await a4Pdf({ jpeg: await jpegPhoto(1654, 2339, { noise: 1, quality: 5 }) })
    const res = await (await openPdf(scan)).compress({ imageDpi: 150 })
    expect(res.imagesResampled).toBe(0)
    expect(res.imagesLeft).toEqual({ 'not-smaller': 1 })
  })

  it('garbage that is not a PDF throws (the runner turns that into engine-failed)', async () => {
    await expect(openPdf(Buffer.from('%PDF-1.4 this is not really a pdf'))).rejects.toThrow()
  })
})

// The independent reader. poppler is installed on the VPS and on GitHub's ubuntu runners; when it is not, these
// tests are SKIPPED and say so — and the script itself refuses to run without it.
const poppler = (await popplerStatus()).ok
// In CI a missing poppler must be a RED test, never a quiet skip: skipping would leave the integrity check untested while the job stays green.
it.skipIf(!process.env.CI)('poppler is installed in CI (otherwise the integrity-check tests below would be silently skipped)', () => {
  expect(poppler).toBe(true)
})
describe.skipIf(!poppler)('poppler integration — the check that decides whether a PDF may be replaced', () => {
  const tools = popplerTools()

  it('the engine output of a scanned PDF passes: same pages, same text, same-looking page', async () => {
    const scan = await a4Pdf({ png: await pngPhoto(1654, 2339, 12), text: 'Invoice 1234 total 99.00' })
    const before = await tools.analyze(scan)
    expect(before).toMatchObject({ pages: 1 })
    expect(before.text).toContain('Invoice 1234 total 99.00')
    const out = (await (await openPdf(scan)).compress({ imageDpi: 150 })).bytes
    expect(await tools.verify(scan, out, before, { exact: false })).toEqual({ ok: true })
  })

  it('a structure-only rewrite of a text PDF passes', async () => {
    const pdf = await a4Pdf({ text: 'Just text, nothing else' })
    const before = await tools.analyze(pdf)
    expect(await tools.verify(pdf, (await (await openPdf(pdf)).compress({ imageDpi: null })).bytes, before, { exact: true })).toEqual({ ok: true })
  })

  it('catches a changed text layer', async () => {
    const a = await a4Pdf({ text: 'Total 100.00' })
    const b = await a4Pdf({ text: 'Total 900.00' })
    expect(await tools.verify(a, b, await tools.analyze(a), { exact: true })).toMatchObject({ ok: false, problem: expect.stringMatching(/text layer changed/) })
  })

  it('catches a lost page', async () => {
    const one = await a4Pdf({ text: 'same' })
    const doc = await PDFDocument.load(one)
    doc.addPage([595, 842])
    const two = Buffer.from(await doc.save())
    expect(await tools.verify(two, one, await tools.analyze(two), { exact: true })).toMatchObject({ ok: false, problem: expect.stringMatching(/pages 2 -> 1/) })
  })

  it('catches a page whose picture is not the same picture (same text, same number of images, different pixels)', async () => {
    const withScan = await a4Pdf({ png: await pngPhoto(800, 1100, 30), text: 'same text' })
    const white = await sharp({ create: { width: 800, height: 1100, channels: 3, background: '#ffffff' } }).png().toBuffer()
    const blanked = await a4Pdf({ png: white, text: 'same text' })
    expect(await tools.verify(withScan, blanked, await tools.analyze(withScan), { exact: false })).toMatchObject({ ok: false, problem: expect.stringMatching(/looks different/) })
  })

  it('catches different fonts, different embedded files and a different number of images — even when text and pages match', async () => {
    const withFont = async (font: StandardFonts) => {
      const doc = await PDFDocument.create()
      doc.addPage([595, 842]).drawText('Invoice 55', { x: 50, y: 780, size: 14, font: await doc.embedFont(font) })
      return doc
    }
    const helv = Buffer.from(await (await withFont(StandardFonts.Helvetica)).save())
    const cour = Buffer.from(await (await withFont(StandardFonts.Courier)).save())
    const probe = await tools.analyze(helv)
    expect(await tools.verify(helv, cour, probe, { exact: false })).toMatchObject({ ok: false, problem: 'fonts changed' })

    const attached = await withFont(StandardFonts.Helvetica)
    await attached.attach(Buffer.from('<xml/>'), 'invoice.xml', { mimeType: 'application/xml' })
    expect(await tools.verify(helv, Buffer.from(await attached.save()), probe, { exact: false })).toMatchObject({ ok: false, problem: 'embedded files changed' })

    const withImage = await a4Pdf({ png: await pngPhoto(300, 400), text: 'Invoice 55' })
    const withoutImage = await a4Pdf({ text: 'Invoice 55' })
    expect(await tools.verify(withImage, withoutImage, await tools.analyze(withImage), { exact: false })).toMatchObject({ ok: false, problem: 'image placements 1 -> 0' })
  })

  it('compares every page up to 30, not just the first few: a line missing on page 7 is caught', async () => {
    const book = async (lineOnLast: boolean) => {
      const doc = await PDFDocument.create()
      const font = await doc.embedFont(StandardFonts.Helvetica)
      for (let i = 1; i <= 7; i++) {
        const page = doc.addPage([595, 842])
        page.drawText(`page ${i}`, { x: 50, y: 780, size: 14, font })
        if (i === 7 && lineOnLast) page.drawLine({ start: { x: 40, y: 600 }, end: { x: 555, y: 600 }, thickness: 1 })
      }
      return Buffer.from(await doc.save())
    }
    const [full, dropped] = [await book(true), await book(false)]
    expect(await tools.verify(full, dropped, await tools.analyze(full), { exact: true })).toMatchObject({ ok: false, problem: expect.stringMatching(/page 7 looks different/) })
  })

  it('catches output poppler cannot open', async () => {
    const pdf = await a4Pdf({ text: 'x' })
    expect((await tools.verify(pdf, Buffer.from('%PDF-1.4 garbage'), await tools.analyze(pdf), { exact: true })).ok).toBe(false)
  })
})
