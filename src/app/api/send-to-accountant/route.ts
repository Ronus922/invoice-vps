import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { sendInvoiceToAccountant } from '@/lib/accountant-send'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  try {
    const { file_url, vendor, date, invoice_id } = await request.json()
    if (!file_url) {
      return NextResponse.json({ sent: false, error: 'file_url is required' }, { status: 400 })
    }

    let needsReview = false
    let alreadySentAt: string | null = null
    let fileName: string | null = null
    let resolvedId = invoice_id || null
    if (!resolvedId) {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id, needs_review, sent_to_accountant_at, file_name')
        .eq('file_url', file_url)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (invoice) {
        resolvedId = invoice.id
        needsReview = Boolean(invoice.needs_review)
        alreadySentAt = invoice.sent_to_accountant_at
        fileName = invoice.file_name
      }
    } else {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('needs_review, sent_to_accountant_at, file_name')
        .eq('id', resolvedId)
        .maybeSingle()
      needsReview = Boolean(invoice?.needs_review)
      alreadySentAt = invoice?.sent_to_accountant_at ?? null
      fileName = invoice?.file_name ?? null
    }

    // Idempotency: a double click / second tab must not email the accountant
    // twice for the same invoice.
    if (alreadySentAt) {
      return NextResponse.json({ skipped: true, reason: 'already_sent' })
    }

    const result = await sendInvoiceToAccountant({
      invoiceId: resolvedId,
      fileUrl: file_url,
      fileName,
      vendor,
      date,
      needsReview,
    })

    if (!result.sent && result.reason === 'needs_review') {
      return NextResponse.json({ skipped: true, reason: 'needs_review' })
    }
    if (!result.sent && result.reason) {
      return NextResponse.json({ skipped: true, reason: result.reason })
    }
    if (!result.sent) {
      return NextResponse.json({ sent: false, error: result.error }, { status: 500 })
    }
    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[send-to-accountant] error:', err)
    return NextResponse.json({ sent: false, error: 'internal_error' }, { status: 500 })
  }
}
