// Synthetic inputs for the scan-flow harness: a "photo" of a paper receipt on a dark table (portrait, tilted,
// with printed-looking rows) and a tiny PDF. No real receipt is used.
import sharp from 'sharp'

let seed = 11
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647

function rows(x, y, w, h, n) {
  let s = ''
  const step = h / n
  for (let i = 0; i < n; i++) {
    const len = w * (0.35 + 0.6 * rnd())
    for (let gx = x; gx < x + len; gx += 14 + rnd() * 10) s += `<rect x="${gx.toFixed(1)}" y="${(y + i * step).toFixed(1)}" width="${(8 + rnd() * 10).toFixed(1)}" height="${(step * 0.55).toFixed(1)}" fill="#1b1b1b"/>`
  }
  return s
}

/** variant 'wide' = a shop receipt, 'tall' = a long, narrow supermarket strip. Returns a JPEG buffer. */
export async function receiptPhoto(variant = 'wide') {
  const [W, H] = variant === 'tall' ? [1600, 2800] : [1800, 2400] // different sizes, so a swapped photo is detectable
  const paper = variant === 'tall' ? { x: 600, y: 160, w: 420, h: 2440, n: 66 } : { x: 320, y: 500, w: 1160, h: 1300, n: 26 }
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(${variant === 'tall' ? 1.5 : -3} ${paper.x + paper.w / 2} ${paper.y + paper.h / 2})">
      <rect x="${paper.x}" y="${paper.y}" width="${paper.w}" height="${paper.h}" fill="#f3f1e9"/>
      ${rows(paper.x + paper.w * 0.08, paper.y + paper.h * 0.05, paper.w * 0.84, paper.h * 0.9, paper.n)}
    </g></svg>`
  return sharp({ create: { width: W, height: H, channels: 3, background: '#2b2723' } })
    .composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 88 }).toBuffer()
}

/** The smallest thing that is a PDF to every check the upload route and the browser make. */
export function tinyPdf() {
  return Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
}
