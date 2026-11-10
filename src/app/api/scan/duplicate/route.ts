import { NextResponse, type NextRequest } from 'next/server'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { supabaseScanStore } from '@/lib/scan/store'
import { parseAmount } from '@/lib/scan/format'
import { duplicateQuerySchema } from '@/lib/scan/validation'

export const runtime = 'nodejs'

// GET /api/scan/duplicate?doc_number=&date=&total=&vendor_tax_id= — "does this document already exist?", asked by
// the review form while Ronen edits, so a collision is SHOWN before he presses save. The same lookup
// runs again inside POST /api/scan/save (which is what actually guards the table); this one is only the
// early warning. Read-only.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const sp = req.nextUrl.searchParams
  const parsed = duplicateQuerySchema.safeParse({
    doc_number: sp.get('doc_number') ?? '',
    date: sp.get('date') ?? '',
    total: sp.get('total') ?? '',
    vendor_tax_id: sp.get('vendor_tax_id') ?? '',
  })
  if (!parsed.success) return NextResponse.json({ error: 'פרמטרים לא תקינים' }, { status: 400 })

  try {
    const existing = await supabaseScanStore().findDuplicate({
      docNumber: parsed.data.doc_number,
      date: parsed.data.date || null,
      total: parseAmount(parsed.data.total),
      vendorTaxId: parsed.data.vendor_tax_id || null,
    })
    return NextResponse.json({ duplicate: existing !== null, existing }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'בדיקת הכפילות נכשלה' }, { status: 500 })
  }
}
