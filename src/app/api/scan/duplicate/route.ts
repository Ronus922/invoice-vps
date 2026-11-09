import { NextResponse, type NextRequest } from 'next/server'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { supabaseScanStore } from '@/lib/scan/store'
import { duplicateQuerySchema } from '@/lib/scan/validation'

export const runtime = 'nodejs'

// GET /api/scan/duplicate?vendor=&doc_number=&doc_type= — "does this document already exist?", asked by
// the review form while Ronen edits, so a collision is SHOWN before he presses save. The same lookup
// runs again inside POST /api/scan/save (which is what actually guards the table); this one is only the
// early warning. Read-only.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const sp = req.nextUrl.searchParams
  const parsed = duplicateQuerySchema.safeParse({
    vendor: sp.get('vendor') ?? '',
    doc_number: sp.get('doc_number') ?? '',
    doc_type: sp.get('doc_type') ?? 'unknown',
  })
  if (!parsed.success) return NextResponse.json({ error: 'פרמטרים לא תקינים' }, { status: 400 })

  try {
    const existing = await supabaseScanStore().findDuplicate({
      vendor: parsed.data.vendor,
      docNumber: parsed.data.doc_number,
      docType: parsed.data.doc_type,
    })
    return NextResponse.json({ duplicate: existing !== null, existing }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'בדיקת הכפילות נכשלה' }, { status: 500 })
  }
}
