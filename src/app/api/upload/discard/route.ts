import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { discardUnreferencedUpload } from '@/lib/discard-upload'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BodySchema = z.object({ file_url: z.string().min(1).max(2048) })

// POST /api/upload/discard — the browser's roads (manual upload, folder scan) upload a file BEFORE they know whether it
// becomes a row. When it does not (a duplicate, a failed extraction, a failed save) this removes the object again.
// Only a freshly uploaded object that no invoices row points at is ever removed (src/lib/discard-upload.ts); anything
// else is answered, not touched. Idempotent: a second call finds nothing to remove and says so.
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })

  const result = await discardUnreferencedUpload(supabase, parsed.data.file_url)
  return NextResponse.json({ result }, { headers: { 'Cache-Control': 'private, no-store' } })
}
