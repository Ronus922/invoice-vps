import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { SHA256_HEX, recordUnverifiedHash } from '@/lib/folder-hashes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BodySchema = z.object({
  sha256: z.string().regex(SHA256_HEX),
  existing_id: z.string().uuid(),
  reason: z.string().min(1).max(60).default('unverified_duplicate'),
  file_name: z.string().max(300).nullable().optional(),
})

// POST /api/folder-hashes — the folder scan recognised this file as a duplicate but could not confirm the row it
// duplicates, so the file stays in the folder: remember its hash, and the next scans skip it before the upload and the
// extraction (src/lib/folder-hashes.ts).
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })

  const ok = await recordUnverifiedHash(supabase, {
    sha256: parsed.data.sha256,
    existing_id: parsed.data.existing_id,
    reason: parsed.data.reason,
    file_name: parsed.data.file_name ?? null,
  })
  if (!ok) return NextResponse.json({ error: 'שמירת הקובץ נכשלה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
