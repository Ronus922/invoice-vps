import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Redirect to Google OAuth consent screen
export async function GET() {
  // Read client_id from DB first, fallback to env
  const { data: tokenRow } = await supabase
    .from('gmail_tokens')
    .select('client_id')
    .eq('id', 'default')
    .single()

  const clientId = tokenRow?.client_id || process.env.GMAIL_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'GMAIL_CLIENT_ID not configured' }, { status: 500 })
  }

  const redirectUri = `${process.env.APP_URL}/api/gmail-auth/callback`
  const scope = 'https://www.googleapis.com/auth/gmail.readonly'

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', scope)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')

  return NextResponse.redirect(authUrl.toString())
}
