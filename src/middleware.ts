import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isAllowedEmail } from '@/lib/auth-allowlist'

export async function middleware(request: NextRequest) {
  // Always refresh the session first
  const response = await updateSession(request)

  const { pathname } = request.nextUrl

  // Public routes — no auth required
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/callback')
  ) {
    return response
  }

  // Cron endpoints — authorized by shared secret header instead of user session
  if (pathname === '/api/backup-to-drive' || pathname === '/api/scan-gmail') {
    const secret = request.headers.get('x-cron-secret')
    if (secret && process.env.CRON_SECRET && secret === process.env.CRON_SECRET) {
      return response
    }
  }

  // Check if user is authenticated
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // API routes: return JSON 401 instead of HTML redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'נדרשת התחברות מחדש' },
        { status: 401 }
      )
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated but not on the allowlist — lock out regardless of provider
  if (!isAllowedEmail(user.email)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'אין לך הרשאה לגשת למערכת' },
        { status: 403 }
      )
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('error', 'forbidden')
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icons, manifest
     * - public files (images, sw.js)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icon-192\\.png|icon-512\\.png|icon\\.svg|apple-touch-icon\\.png|manifest\\.json|sw\\.js).*)',
  ],
}
