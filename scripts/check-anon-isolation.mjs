#!/usr/bin/env node
// INVARIANT: the public anon key cannot read the sensitive tables directly.
//   Supabase PostgREST exposes the DB to anyone holding the anon key. If RLS is
//   off / a policy or GRANT leaks, invoices (money) and gmail_tokens (OAuth
//   refresh token!) become world-readable, bypassing the app's auth entirely.
//   This is the documented shared-postgres exposure failure mode.
// Read-only: it TRIES to read as anon and asserts it gets nothing.
import { run, fail, ok, info } from './_lib.mjs'

const SENSITIVE = ['invoices', 'gmail_tokens', 'scanned_emails']

run('check-anon-isolation', async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return fail('חסר NEXT_PUBLIC_SUPABASE_URL / ANON_KEY')

  for (const table of SENSITIVE) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    })
    if (res.status === 200) {
      const rows = await res.json().catch(() => [])
      if (Array.isArray(rows) && rows.length > 0) {
        fail(`anon קרא נתונים מ-${table} (${rows.length}+ שורות חשופות!)`)
      } else {
        ok(`${table} — anon מקבל 0 שורות`)
      }
    } else {
      // 401/403/404 — anon is denied. Any non-200 is a pass for isolation.
      ok(`${table} — anon נחסם (HTTP ${res.status})`)
    }
  }
  info('נבדק מול anon key בלבד — ה-service-role שמור לצד שרת')
})
