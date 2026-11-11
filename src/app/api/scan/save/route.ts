import { NextResponse, type NextRequest } from 'next/server'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { MAX_SCAN_IMAGE_BYTES } from '@/lib/scan/model'
import { saveScannedReceipt } from '@/lib/scan/save'
import { supabaseScanStore } from '@/lib/scan/store'
import { imageErrorResponse } from '@/lib/scan/upload'
import { scanSaveSchema } from '@/lib/scan/validation'

export const runtime = 'nodejs'

// POST /api/scan/save — step 3: Ronen approved the form. multipart: `image` (the photo, normally the
// compressed JPEG the OCR step returned) and `data` (the fields as JSON). Everything that matters is
// in saveScannedReceipt (src/lib/scan/save.ts): the duplicate check FIRST, the photo re-verified, the
// row passed through the same normalisation as every other document, the insert guarded by the
// table's unique index. A collision is answered 409 with the existing row — never a silent skip.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_SCAN_IMAGE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'התמונה גדולה מדי' }, { status: 413 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const file = form.get('image')
  const rawData = form.get('data')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'חסר צילום של הקבלה' }, { status: 400 })
  }
  if (file.size > MAX_SCAN_IMAGE_BYTES) return NextResponse.json({ error: 'התמונה גדולה מדי' }, { status: 413 })
  if (typeof rawData !== 'string') return NextResponse.json({ error: 'חסרים פרטי הקבלה' }, { status: 400 })

  let json: unknown
  try {
    json = JSON.parse(rawData)
  } catch {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })
  }
  const parsed = scanSaveSchema.safeParse(json)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.') || '?').join(', ')
    return NextResponse.json({ error: `נתונים לא תקינים — ${fields}` }, { status: 400 })
  }

  const result = await saveScannedReceipt(supabaseScanStore(), {
    data: parsed.data,
    image: Buffer.from(await file.arrayBuffer()),
    actorId: user.id,
  })

  switch (result.kind) {
    case 'saved':
      return NextResponse.json({ invoice: result.invoice }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
    case 'upgraded':
      // Decision 1: the stored receipt of this transaction took this scan's photo and type — 200, not 201: no row was created.
      // `sent` is true only when the tax invoice really went to the accountant: the screen says "sent" from this alone.
      return NextResponse.json(
        { invoice: result.invoice, upgraded: true, sent: result.sent, send_note: result.sendNote },
        { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
      )
    case 'duplicate':
      return NextResponse.json(
        { error: 'המסמך כבר קיים במערכת', duplicate: true, existing: result.existing },
        { status: 409, headers: { 'Cache-Control': 'private, no-store' } },
      )
    case 'bad_image':
      return imageErrorResponse(result.error)
    case 'failed':
      return NextResponse.json(
        { error: result.stage === 'upload' ? 'שמירת הצילום נכשלה — נסה שוב' : 'שמירת הקבלה נכשלה — נסה שוב' },
        { status: result.stage === 'upload' ? 502 : 500 },
      )
  }
}
