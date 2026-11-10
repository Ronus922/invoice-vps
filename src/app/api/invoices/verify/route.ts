import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { verifyStoredDocument } from '@/lib/verify-stored-document'

export const runtime = 'nodejs'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET /api/invoices/verify?id=<invoice id> — "does this row exist, and is its file in the bucket?". Asked by the folder
// scan before it deletes a source file as a duplicate of that row (src/lib/verify-stored-document.ts). Read-only;
// answers { ok: true } or { ok: false, reason }. Only the row id goes in — never a path or a URL.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const id = z.string().uuid().safeParse(req.nextUrl.searchParams.get('id') ?? '')
  if (!id.success) return NextResponse.json({ error: 'id לא תקין' }, { status: 400 })

  const result = await verifyStoredDocument(supabase, id.data)
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
}
