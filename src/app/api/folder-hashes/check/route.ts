import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { SHA256_HEX, findKnownHashes } from '@/lib/folder-hashes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BodySchema = z.object({ hashes: z.array(z.string().regex(SHA256_HEX)).min(1).max(50) })

// POST /api/folder-hashes/check — which of these file hashes did an earlier folder scan recognise as a duplicate it could
// not confirm? The scan skips those files before the upload and the extraction (src/lib/folder-hashes.ts).
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })

  try {
    const known = await findKnownHashes(supabase, parsed.data.hashes)
    return NextResponse.json({ known }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[folder-hashes check]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'בדיקת הקבצים נכשלה' }, { status: 500 })
  }
}
