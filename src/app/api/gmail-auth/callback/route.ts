import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
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

  const savedOk = !dbError

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>Gmail OAuth</title>
<style>body{font-family:system-ui;max-width:600px;margin:50px auto;padding:20px;background:#0f172a;color:#e2e8f0}
code{background:#1e293b;padding:8px 16px;border-radius:8px;display:block;margin:16px 0;word-break:break-all;color:#4ade80;font-size:14px}
h1{color:#4ade80}.warn{color:#fbbf24}a{color:#60a5fa;text-decoration:none}</style>
<meta http-equiv="refresh" content="5;url=/">
</head>
<body>
${savedOk
  ? `<h1>Gmail OAuth הצליח!</h1>
<p>הטוקן נשמר אוטומטית במסד הנתונים.</p>
<p>אין צורך לעשות שום דבר נוסף - הסריקה תעבוד מיד.</p>
<p>מועבר לדף הראשי בעוד 5 שניות... <a href="/">או לחץ כאן</a></p>`
  : `<h1 class="warn">OAuth הצליח, אבל השמירה נכשלה</h1>
<p>הטוקן התקבל אבל לא נשמר ב-DB:</p>
<code>${dbError?.message || 'Unknown error'}</code>
<p>Refresh token לשמירה ידנית:</p>
<code>${tokens.refresh_token || 'לא התקבל'}</code>`}
</body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
