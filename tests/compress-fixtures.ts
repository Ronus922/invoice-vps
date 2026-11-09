import sharp from 'sharp'
import { PDFDocument, StandardFonts } from 'pdf-lib'

// Synthetic test material, generated in code (no binary fixtures in git). Deterministic: the "noise" is a fixed
// pseudo-random sequence, so a test that passes today passes tomorrow.

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/** Raw RGB pixels: a smooth colour pattern plus `noise` levels of grain (more grain = heavier JPEG). */
export function rawPhoto(w: number, h: number, noise: number, seed = 1): Buffer {
  const rnd = lcg(seed)
  const out = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      const base = 128 + 90 * Math.sin(x / 90) * Math.cos(y / 70)
      const n = (rnd() - 0.5) * 2 * noise
      out[i] = Math.max(0, Math.min(255, base + n))
      out[i + 1] = Math.max(0, Math.min(255, 255 - base * 0.8 + n))
      out[i + 2] = Math.max(0, Math.min(255, 60 + x / 20 + n))
    }
  }
  return out
}

export async function jpegPhoto(w: number, h: number, opts: { noise?: number; quality?: number; orientation?: number } = {}): Promise<Buffer> {
  const img = sharp(rawPhoto(w, h, opts.noise ?? 10), { raw: { width: w, height: h, channels: 3 } })
  return img.jpeg({ quality: opts.quality ?? 95 }).withMetadata(opts.orientation ? { orientation: opts.orientation } : {}).toBuffer()
}

export async function pngPhoto(w: number, h: number, noise = 10): Promise<Buffer> {
  return sharp(rawPhoto(w, h, noise), { raw: { width: w, height: h, channels: 3 } }).png().toBuffer()
}

/** A one-page A4 PDF with `text` on it and, when given, a full-page JPEG or PNG scan. */
export async function a4Pdf(opts: { text?: string; jpeg?: Buffer; png?: Buffer }): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  if (opts.jpeg) page.drawImage(await doc.embedJpg(opts.jpeg), { x: 0, y: 0, width: 595, height: 842 })
  if (opts.png) page.drawImage(await doc.embedPng(opts.png), { x: 0, y: 0, width: 595, height: 842 })
  if (opts.text) page.drawText(opts.text, { x: 50, y: 780, size: 14, font: await doc.embedFont(StandardFonts.Helvetica) })
  return Buffer.from(await doc.save())
}
