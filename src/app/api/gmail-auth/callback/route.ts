import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const code = request.nextUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'No authorization code received' }, { status: 400 })
  }

  // Read current credentials from DB (fallback to env)
  const { data: tokenRow } = await supabase
    .from('gmail_tokens')
    .select('client_id, client_secret')
    .eq('id', 'default')
    .single()

  const clientId = tokenRow?.client_id || process.env.GMAIL_CLIENT_ID
  const clientSecret = tokenRow?.client_secret || process.env.GMAIL_CLIENT_SECRET
  const redirectUri = `${process.env.APP_URL}/api/gmail-auth/callback`

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Gmail OAuth credentials not configured' }, { status: 500 })
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `Token exchange failed: ${err}` }, { status: 500 })
  }

  const tokens = await res.json()

  // Save tokens to DB automatically
  const { error: dbError } = await supabase
    .from('gmail_tokens')
    .upsert({
      id: 'default',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })

  if (dbError) {
    // Never render tokens to the client — log server-side, show a generic error.
    console.error('[gmail-auth/callback] DB save error:', dbError)
    return new NextResponse(
      `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>Gmail OAuth</title></head><body style="font-family:system-ui;max-width:600px;margin:50px auto;padding:20px">שגיאה בשמירת ההרשאה. נסה שוב.</body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>Gmail OAuth</title>
<style>body{font-family:system-ui;max-width:600px;margin:50px auto;padding:20px;background:#0f172a;color:#e2e8f0}
h1{color:#4ade80}a{color:#60a5fa;text-decoration:none}</style>
<meta http-equiv="refresh" content="5;url=/">
</head>
<body>
<h1>Gmail OAuth הצליח!</h1>
<p>הטוקן נשמר אוטומטית במסד הנתונים.</p>
<p>אין צורך לעשות שום דבר נוסף - הסריקה תעבוד מיד.</p>
<p>מועבר לדף הראשי בעוד 5 שניות... <a href="/">או לחץ כאן</a></p>
</body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
