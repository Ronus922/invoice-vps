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
  // Human-readable name for the email attachment (storage keys are uuids).
  fileName?: string | null
  vendor?: string | null
  date?: string | null
  needsReview?: boolean
}

// MIME headers reject quotes/CRLF (header injection via attacker-supplied
// Gmail filenames); a bare storage path is not a valid URL for `new URL`.
function safeAttachmentFilename(input: SendInput): string {
  const fromName = (input.fileName || '').replace(/["\r\n]/g, '').trim()
  if (fromName) return fromName
  const path = input.fileUrl.split('?')[0]
  const last = path.split('/').pop() || 'invoice.pdf'
  try {
    return decodeURIComponent(last).replace(/["\r\n]/g, '') || 'invoice.pdf'
  } catch {
    return 'invoice.pdf'
  }
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

export interface DrainResult {
  attempted: number
  sent: number
  failed: number
}

// Safety net: nothing stays permanently unsent. Retries every pending row
// (uses the partial index invoices_accountant_pending_idx) — covers process
// restarts mid-send, transient Gmail failures, and rows fixed after review.
// Filters on the live needs_review column, NOT accountant_send_error: that
// string goes stale once a user fixes the amounts.
export async function drainUnsentToAccountant(limit = 25): Promise<DrainResult> {
  const result: DrainResult = { attempted: 0, sent: 0, failed: 0 }

  // Preconditions first — without an accountant address or Gmail connection
  // every send would fail and needlessly rewrite accountant_send_error rows.
  const accountantEmail = await getAccountantEmail()
  if (!accountantEmail) return result
  try {
    await getGmailAccessToken()
  } catch {
    return result
  }

  const { data: pending } = await supabase
    .from('invoices')
    .select('id, file_url, file_name, vendor, date')
    .is('sent_to_accountant_at', null)
    .eq('needs_review', false)
    .not('file_url', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!pending || pending.length === 0) return result

  // Sequential batches of 3 — same Gmail rate-limit rationale as the banner.
  const BATCH = 3
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH)
    await Promise.all(
      batch.map(async (row) => {
        // Re-check just before sending — a user clicking the banner while the
        // drain runs must not produce a duplicate email.
        const { data: fresh } = await supabase
          .from('invoices')
          .select('sent_to_accountant_at, needs_review')
          .eq('id', row.id)
          .maybeSingle()
        if (!fresh || fresh.sent_to_accountant_at || fresh.needs_review) return

        result.attempted += 1
        try {
          const sendResult = await sendInvoiceToAccountant({
            invoiceId: row.id,
            fileUrl: row.file_url,
            fileName: row.file_name,
            vendor: row.vendor,
            date: row.date,
            needsReview: false,
          })
          if (sendResult.sent) result.sent += 1
          else result.failed += 1
        } catch (err) {
          console.error('[accountant-send] drain send failed:', err, 'invoice:', row.id)
          result.failed += 1
        }
      })
    )
  }

  return result
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
    const filename = safeAttachmentFilename(input)

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
