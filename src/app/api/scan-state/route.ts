import { NextResponse } from 'next/server'
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
    .select('last_scan_completed_at, last_folder_scan_at')
    .eq('id', 'default')
    .single()

  return NextResponse.json({
    lastEmailScanAt: data?.last_scan_completed_at ?? null,
    lastFolderScanAt: data?.last_folder_scan_at ?? null,
  })
}
