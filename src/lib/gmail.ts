import { createClient } from '@supabase/supabase-js'
import { fetchWithRetry } from '@/lib/http-retry'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getGmailAccessToken(): Promise<string> {
  const { data: tokenRow } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('id', 'default')
    .single()

  const clientId = tokenRow?.client_id || process.env.GMAIL_CLIENT_ID
  const clientSecret = tokenRow?.client_secret || process.env.GMAIL_CLIENT_SECRET
  const refreshToken = tokenRow?.refresh_token || process.env.GMAIL_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth credentials not configured. Go to /api/gmail-auth to connect.')
  }

  if (tokenRow?.access_token && tokenRow?.access_token_expires_at) {
    const expiresAt = new Date(tokenRow.access_token_expires_at).getTime()
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return tokenRow.access_token
    }
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to refresh Gmail token: ${err}`)
  }

  const data = await res.json()

  await supabase
    .from('gmail_tokens')
    .update({
      access_token: data.access_token,
      access_token_expires_at: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 'default')

  return data.access_token
}

/** The connected Gmail account's own address (users.getProfile), lower-cased; null when it cannot be read —
 *  the callers then rely on the other signs (src/lib/own-send.ts). */
export async function getGmailOwnAddress(accessToken: string): Promise<string | null> {
  try {
    const res = await fetchWithRetry('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      console.warn('[gmail] could not read the account address (HTTP %d) — the own-mail address rule is off for this scan', res.status)
      return null
    }
    const data = (await res.json()) as { emailAddress?: unknown }
    return typeof data.emailAddress === 'string' && data.emailAddress ? data.emailAddress.toLowerCase() : null
  } catch (err) {
    console.warn('[gmail] could not read the account address — the own-mail address rule is off for this scan:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function getAccountantEmail(): Promise<string | null> {
  const { data } = await supabase
    .from('gmail_tokens')
    .select('accountant_email')
    .eq('id', 'default')
    .single()

  return data?.accountant_email || null
}
