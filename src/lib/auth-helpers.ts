import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Unauthorized', message: 'נדרשת התחברות מחדש' },
    { status: 401 }
  )
}
