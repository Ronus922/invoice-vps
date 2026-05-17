import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB — aligned with nginx client_max_body_size

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'לא נשלח קובץ' }, { status: 400 })
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'הקובץ ריק' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'הקובץ חורג מ-20MB' }, { status: 413 })
  }

  const mime = (file.type || '').toLowerCase()
  const ext = ALLOWED_MIME_TO_EXT[mime]
  if (!ext) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 415 })
  }

  const path = `invoices/${uuidv4()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage
    .from('invoice-files')
    .upload(path, buffer, { contentType: mime })

  if (error) {
    console.error('[upload] storage error:', error)
    return NextResponse.json({ error: 'העלאה נכשלה' }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('invoice-files').getPublicUrl(path)

  return NextResponse.json({ file_url: publicUrl })
}
