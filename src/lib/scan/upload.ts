import { NextResponse, type NextRequest } from 'next/server'
import { ScanImageError } from './image'
import { MAX_SCAN_IMAGE_BYTES } from './model'

// The first half of every route that takes a photo of a receipt: size limits, the multipart
// parse, and the image pipeline with its errors turned into the answers the screen shows.
// One place, so the OCR and the save cannot answer the same bad upload differently.

export type ImageUpload<T> = { ok: true; value: T; form: FormData; file: File } | { ok: false; response: NextResponse }

const refuse = (error: string, status: number): { ok: false; response: NextResponse } => ({
  ok: false,
  response: NextResponse.json({ error }, { status }),
})

/** The answer for a photo the pipeline could not process. */
export function imageErrorResponse(err: ScanImageError): NextResponse {
  if (err.code === 'unsupported') return NextResponse.json({ error: 'הקובץ אינו תמונה נתמכת' }, { status: 415 })
  if (err.code === 'too_large') return NextResponse.json({ error: 'התמונה גדולה מדי — צלם ברזולוציה נמוכה יותר' }, { status: 413 })
  return NextResponse.json({ error: 'לא ניתן לפתוח את התמונה — צלם שוב' }, { status: 422 })
}

/** Reads `field` of a multipart body and runs `convert` on its bytes (compressReceiptImage). The parsed
 *  form comes back too (a body can be read once), for the callers that carry another field beside the photo. */
export async function readImageUpload<T>(
  req: NextRequest,
  convert: (input: Buffer) => Promise<T>,
  field = 'image',
): Promise<ImageUpload<T>> {
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_SCAN_IMAGE_BYTES + 64 * 1024) return refuse('התמונה גדולה מדי', 413)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return refuse('בקשה לא תקינה', 400)
  }
  const file = form.get(field)
  if (!(file instanceof File) || file.size === 0) return refuse('לא נשלחה תמונה', 400)
  if (file.size > MAX_SCAN_IMAGE_BYTES) return refuse('התמונה גדולה מדי', 413)

  try {
    return { ok: true, value: await convert(Buffer.from(await file.arrayBuffer())), form, file }
  } catch (err) {
    if (err instanceof ScanImageError) return { ok: false, response: imageErrorResponse(err) }
    throw err
  }
}
