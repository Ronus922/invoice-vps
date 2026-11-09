import { NextResponse, type NextRequest } from 'next/server'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { fromStoredDate } from '@/lib/scan/format'
import { contentDisposition, receiptFileName } from '@/lib/scan/downloadName'
import { downloadScanPhoto, getScanRow } from '@/lib/scan/store'

export const runtime = 'nodejs'

interface RouteCtx {
  params: Promise<{ id: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/scan/[id]/image[?download=1] — the stored photo of a SCANNED receipt, streamed by the server.
// Session + allowlist; the bytes come from the private bucket through the service role and go straight
// to the browser — the client never receives a signed or public storage URL. Only rows with
// source = 'scan' are served (every other document keeps using /api/file), so this route cannot be turned
// into a general file proxy. `?download=1` answers `Content-Disposition: attachment` with the name
// {vendor}_{doc_number}_{doc_date}.jpg (Hebrew per RFC 5987, `' ( ) *` encoded too).
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const row = await getScanRow(id)
  if (!row?.file_url) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const bytes = await downloadScanPhoto(row.file_url)
  if (!bytes) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const download = req.nextUrl.searchParams.get('download') === '1'
  const name = receiptFileName({ vendor: row.vendor, docNumber: row.doc_number, docDate: fromStoredDate(row.date) })
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(bytes.length),
      'Content-Disposition': contentDisposition(download ? 'attachment' : 'inline', name),
      // A receipt on a phone: never kept by a shared cache.
      'Cache-Control': 'private, no-store',
    },
  })
}
