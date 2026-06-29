import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { signedUrlFor } from '@/lib/storage'

// Authenticated proxy for viewing/downloading invoice files from the private
// bucket. Gated by middleware (allowlist) + getAuthenticatedUser, then redirects
// to a short-lived signed URL. ?u = the stored file_url (legacy public URL or path).
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const u = request.nextUrl.searchParams.get('u')
  if (!u) return NextResponse.json({ error: 'missing u' }, { status: 400 })

  const signed = await signedUrlFor(u, 120)
  if (!signed) return NextResponse.json({ error: 'file not found' }, { status: 404 })

  return NextResponse.redirect(signed)
}
