import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UpdateSchema = z.object({
  scannedAt: z.string(),
  count: z.number().int().min(0),
  error: z.string().nullable().optional(),
})

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const { data } = await supabase
    .from('gmail_tokens')
    .select('last_folder_scan_at, last_folder_scan_count, last_folder_scan_error')
    .eq('id', 'default')
    .single()

  return NextResponse.json({
    lastScanAt: data?.last_folder_scan_at ?? null,
    lastScanCount: data?.last_folder_scan_count ?? 0,
    lastError: data?.last_folder_scan_error ?? null,
  })
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const body = await request.json().catch(() => ({}))
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })
  }

  const { scannedAt, count, error } = parsed.data

  const { error: dbError } = await supabase
    .from('gmail_tokens')
    .update({
      last_folder_scan_at: scannedAt,
      last_folder_scan_count: count,
      last_folder_scan_error: error ?? null,
    })
    .eq('id', 'default')

  if (dbError) {
    console.error('[folder-watch/scan-state] db error:', dbError)
    return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
