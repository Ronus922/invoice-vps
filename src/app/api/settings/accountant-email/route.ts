import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const { data } = await supabase
    .from('gmail_tokens')
    .select('accountant_email')
    .eq('id', 'default')
    .single()

  return NextResponse.json({ email: data?.accountant_email || '' })
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const { email } = await request.json()

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  }

  const { error } = await supabase
    .from('gmail_tokens')
    .update({ accountant_email: email || null })
    .eq('id', 'default')

  if (error) {
    console.error('[accountant-email POST] supabase error:', error)
    return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
