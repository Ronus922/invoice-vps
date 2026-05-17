import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
