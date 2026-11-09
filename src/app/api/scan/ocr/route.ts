import { NextResponse, type NextRequest } from 'next/server'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { compressReceiptImage } from '@/lib/scan/image'
import { readReceipt } from '@/lib/scan/ocr'
import { EMPTY_SCAN_VALUES, type OcrResponse } from '@/lib/scan/model'
import { readImageUpload } from '@/lib/scan/upload'

export const runtime = 'nodejs'

// POST /api/scan/ocr — step 2 of a scan (step 1 is the crop, in the browser, which also shrinks the
// photo to ≤2000px JPEG for the upload). Takes the CROPPED photo, compresses it (upright, ≤1600px, no
// metadata, contrast-stretched, a progressive JPEG ≤~300KB), asks Claude to read it with the same
// tool the e-mail path uses, and hands back the fields PLUS that compressed photo. NOTHING is stored
// here: the photo reaches Storage only when the row is saved (POST /api/scan/save), so an abandoned
// scan leaves no trace.
//
// Behind the session + allowlist (getAuthenticatedUser); 401 without one. The app has one allowed
// account, so there is no per-user rate limit here (the visitor-scan module in Billing has one for its
// guards); the Anthropic key's own limits apply.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  // ONE encode: the compressed photo is what the model reads, what Ronen sees in the preview, and —
  // posted back by the save step — what Storage keeps.
  const up = await readImageUpload(req, compressReceiptImage)
  if (!up.ok) return up.response
  const img = up.value

  const ocr = await readReceipt(img.bytes, img.contentType)
  const body: OcrResponse = {
    ok: ocr.ok,
    fields: ocr.parsed?.fields ?? { ...EMPTY_SCAN_VALUES },
    passthrough: ocr.parsed?.passthrough ?? { description: '', category: '' },
    confidence: ocr.parsed?.confidence ?? {},
    vat_derived: ocr.parsed?.vatDerived ?? false,
    read_amounts: ocr.parsed?.readAmounts ?? { pretax: null, vat: null },
    image_base64: img.bytes.toString('base64'),
    image_type: img.contentType,
    image_bytes: img.bytes.length,
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
}
