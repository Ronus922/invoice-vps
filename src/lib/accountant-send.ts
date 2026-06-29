import { createClient } from '@supabase/supabase-js'
import { getGmailAccessToken, getAccountantEmail } from '@/lib/gmail'
import { resolveFileUrl } from '@/lib/storage'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface SendInput {
  invoiceId?: string | null
  fileUrl: string
  vendor?: string | null
  date?: string | null
  needsReview?: boolean
}

export interface SendResult {
  sent: boolean
  reason?: string
  error?: string
}

function buildMimeMessage(params: {
  to: string
  subject: string
  bodyText: string
  attachmentData: Buffer
  attachmentFilename: string
  attachmentMimeType: string
}): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const encodedSubject = `=?UTF-8?B?${Buffer.from(params.subject).toString('base64')}?=`

  const lines = [
    `MIME-Version: 1.0`,
    `To: ${params.to}`,
    `Subject: ${encodedSubject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(params.bodyText).toString('base64'),
    ``,
    `--${boundary}`,
    `Content-Type: ${params.attachmentMimeType}; name="${params.attachmentFilename}"`,
    `Content-Disposition: attachment; filename="${params.attachmentFilename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    params.attachmentData.toString('base64'),
    ``,
    `--${boundary}--`,
  ]
  return lines.join('\r\n')
}

async function recordOutcome(
  input: SendInput,
  patch: { sent_to_accountant_at: string | null; accountant_send_error: string | null }
): Promise<void> {
  if (input.invoiceId) {
    await supabase.from('invoices').update(patch).eq('id', input.invoiceId)
    return
  }
  if (input.fileUrl) {
    const { data: row } = await supabase
      .from('invoices')
      .select('id')
      .eq('file_url', input.fileUrl)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (row?.id) {
      await supabase.from('invoices').update(patch).eq('id', row.id)
    }
  }
}

export async function sendInvoiceToAccountant(input: SendInput): Promise<SendResult> {
  if (input.needsReview) {
    const reason = 'needs_review'
    await recordOutcome(input, { sent_to_accountant_at: null, accountant_send_error: reason })
    return { sent: false, reason }
  }

  const accountantEmail = await getAccountantEmail()
  if (!accountantEmail) {
    const reason = 'no_accountant_email'
    await recordOutcome(input, { sent_to_accountant_at: null, accountant_send_error: reason })
    return { sent: false, reason }
  }

  let accessToken: string
  try {
    accessToken = await getGmailAccessToken()
  } catch {
    const reason = 'gmail_not_connected'
    await recordOutcome(input, { sent_to_accountant_at: null, accountant_send_error: reason })
    return { sent: false, reason }
  }

  try {
    const fetchUrl = await resolveFileUrl(input.fileUrl, 60)
    if (!fetchUrl) {
      const error = 'failed_to_fetch_file (no signed url)'
      await recordOutcome(input, { sent_to_accountant_at: null, accountant_send_error: error })
      return { sent: false, error }
    }
    const fileRes = await fetch(fetchUrl)
    if (!fileRes.ok) {
      const error = `failed_to_fetch_file (HTTP ${fileRes.status})`
      await recordOutcome(input, { sent_to_accountant_at: null, accountant_send_error: error })
      return { sent: false, error }
    }

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer())
    const contentType = fileRes.headers.get('content-type') || 'application/pdf'
    const urlPath = new URL(input.fileUrl).pathname
    const filename = decodeURIComponent(urlPath.split('/').pop() || 'invoice.pdf')

    const subject = input.vendor
      ? `חשבונית - ${input.vendor}${input.date ? ` - ${input.date}` : ''}`
      : 'חשבונית חדשה'
    const bodyText = input.vendor ? `מצורפת חשבונית מ${input.vendor}` : 'מצורפת חשבונית'

    const raw = buildMimeMessage({
      to: accountantEmail,
      subject,
      bodyText,
      attachmentData: fileBuffer,
      attachmentFilename: filename,
      attachmentMimeType: contentType,
    })

    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
    })

    if (!sendRes.ok) {
      const errText = await sendRes.text()
      const error = `gmail_send_failed: ${errText.slice(0, 500)}`
      console.error('[accountant-send] gmail send failed:', errText)
      await recordOutcome(input, { sent_to_accountant_at: null, accountant_send_error: error })
      return { sent: false, error }
    }

    await recordOutcome(input, {
      sent_to_accountant_at: new Date().toISOString(),
      accountant_send_error: null,
    })
    return { sent: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'internal_error'
    console.error('[accountant-send] error:', err)
    await recordOutcome(input, { sent_to_accountant_at: null, accountant_send_error: error })
    return { sent: false, error }
  }
}
