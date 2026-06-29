import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmail } from '@/lib/auth-allowlist'
import type { User } from '@supabase/supabase-js'

// Returns the user only if they are both authenticated AND on the allowlist.
// Enforcing the allowlist here (not just in middleware) means every API route —
// all of which call this — is gated independently of the middleware matcher.
export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user ?? null
  if (!user || !isAllowedEmail(user.email)) return null
  return user
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Unauthorized', message: 'נדרשת התחברות מחדש' },
    { status: 401 }
  )
}
