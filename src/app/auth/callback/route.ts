import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmail } from '@/lib/auth-allowlist'

function getOrigin(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-host')
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  if (forwarded) return `${proto}://${forwarded}`
  return new URL(request.url).origin
}

function safeRedirectPath(next: string | null): string {
  if (!next) return '/'
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeRedirectPath(searchParams.get('next'))
  const origin = getOrigin(request)

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data, error: userErr } = await supabase.auth.getUser()
      const user = data.user
      // Couldn't verify identity (transient/network) — retryable, not "forbidden".
      if (userErr || !user) {
        return NextResponse.redirect(`${origin}/login?error=auth`)
      }
      if (!isAllowedEmail(user.email)) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=forbidden`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
