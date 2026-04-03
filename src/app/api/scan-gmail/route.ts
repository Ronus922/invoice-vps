import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const JSON_SCHEMA_PROMPT = `Extract invoice data from this document. Return ONLY a JSON object with these fields:
{
  "date": "DD/MM/YYYY format",
  "vendor": "vendor/supplier name in Hebrew if possible",
  "doc_number": "invoice/receipt number",
  "description": "short description in Hebrew",
  "pretax": number (amount before VAT in NIS),
  "vat": number (VAT amount in NIS),
  "total": number (total including VAT in NIS),
  "payment_method": "payment method in Hebrew if visible",
  "category": "one of: תוכנה, ענן, חשמל, ציוד משרדי, שירותים, תקשורת, ביטוח, שכירות, משלוח, שיווק, הדרכה, תחזוקה, נסיעות, אירוח, אחר"
}
Return ONLY valid JSON, no markdown code fences.`

function base64urlToBase64(b64url: string): string {
  return b64url.replace(/-/g, '+').replace(/_/g, '/')
}

// ─── Gmail Auth ───────────────────────────────────────────

async function getGmailAccessToken(): Promise<string> {
  const { data: tokenRow } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('id', 'default')
    .single()

  const clientId = tokenRow?.client_id || process.env.GMAIL_CLIENT_ID
  const clientSecret = tokenRow?.client_secret || process.env.GMAIL_CLIENT_SECRET
  const refreshToken = tokenRow?.refresh_token || process.env.GMAIL_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth credentials not configured. Go to /api/gmail-auth to connect.')
  }

  if (tokenRow?.access_token && tokenRow?.access_token_expires_at) {
    const expiresAt = new Date(tokenRow.access_token_expires_at).getTime()
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return tokenRow.access_token
    }
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to refresh Gmail token: ${err}`)
  }

  const data = await res.json()

  await supabase
    .from('gmail_tokens')
    .update({
      access_token: data.access_token,
      access_token_expires_at: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 'default')

  return data.access_token
}

// ─── Gmail Helpers ────────────────────────────────────────

async function fetchAttachmentData(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<string | null> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.data
}

function extractEmailHeader(headers: GmailHeader[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailPart {
  filename?: string
  mimeType?: string
  body?: { attachmentId?: string }
}

interface ProcessResult {
  status: 'created' | 'duplicate' | 'error'
  filename: string
  vendor?: string
}

// ─── Attachment Processing ────────────────────────────────

async function processAttachment(
  accessToken: string,
  messageId: string,
  part: GmailPart
): Promise<ProcessResult | null> {
  const filename = part.filename || ''
  const mimeType = part.mimeType || ''
  const isInvoice =
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/') ||
    filename.toLowerCase().endsWith('.pdf')

  if (!isInvoice || !part.body?.attachmentId) return null

  const b64url = await fetchAttachmentData(accessToken, messageId, part.body.attachmentId)
  if (!b64url) return null

  const b64 = base64urlToBase64(b64url)
  const buffer = Buffer.from(b64, 'base64')

  const storagePath = `invoices/gmail_${Date.now()}_${filename}`
  const { error: uploadError } = await supabase.storage
    .from('invoice-files')
    .upload(storagePath, buffer, { contentType: mimeType || 'application/pdf' })

  if (uploadError) return { status: 'error', filename }

  const {
    data: { publicUrl: file_url },
  } = supabase.storage.from('invoice-files').getPublicUrl(storagePath)

  const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')

  try {
    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            isPdf
              ? {
                  type: 'document' as const,
                  source: { type: 'base64' as const, media_type: 'application/pdf', data: b64 },
                }
              : {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                    data: b64,
                  },
                },
            { type: 'text' as const, text: JSON_SCHEMA_PROMPT },
          ],
        },
      ],
    })

    const textBlock = result.content.find((b) => b.type === 'text')
    const text = textBlock && 'text' in textBlock ? textBlock.text : ''
    const cleaned = text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
    const extracted = JSON.parse(cleaned)

    if (extracted.doc_number) {
      const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('doc_number', String(extracted.doc_number))

      if (existing && existing.length > 0) {
        return { status: 'duplicate', filename, vendor: extracted.vendor }
      }
    }

    await supabase.from('invoices').insert({
      ...extracted,
      file_url,
      file_name: filename || `invoice_${Date.now()}.pdf`,
      source: 'gmail',
    })

    return { status: 'created', filename, vendor: extracted.vendor }
  } catch {
    return { status: 'error', filename }
  }
}

// ─── Scan State Helpers ───────────────────────────────────

async function getAlreadyScannedIds(): Promise<Set<string>> {
  const { data } = await supabase.from('scanned_emails').select('email_id')
  return new Set((data || []).map((r) => r.email_id))
}

async function getScanState() {
  const { data } = await supabase
    .from('gmail_tokens')
    .select('last_scan_completed_at, total_scanned_messages, total_found_invoices')
    .eq('id', 'default')
    .single()
  return data
}

async function recordScannedEmail(
  emailId: string,
  emailDate: string | null,
  sender: string,
  subject: string,
  attachmentNames: string[],
  invoicesFound: number,
  scanStatus: 'scanned' | 'no_attachments' | 'error'
) {
  await supabase.from('scanned_emails').upsert({
    email_id: emailId,
    email_date: emailDate,
    sender,
    subject,
    attachment_names: attachmentNames,
    invoices_found: invoicesFound,
    scan_status: scanStatus,
    scanned_at: new Date().toISOString(),
  })
}

async function updateScanState(scannedCount: number, invoicesCount: number) {
  // Get current totals
  const { data: current } = await supabase
    .from('gmail_tokens')
    .select('total_scanned_messages, total_found_invoices')
    .eq('id', 'default')
    .single()

  await supabase
    .from('gmail_tokens')
    .update({
      last_scan_completed_at: new Date().toISOString(),
      total_scanned_messages: (current?.total_scanned_messages || 0) + scannedCount,
      total_found_invoices: (current?.total_found_invoices || 0) + invoicesCount,
    })
    .eq('id', 'default')
}

// ─── GET: Scan status ─────────────────────────────────────

export async function GET() {
  const scanState = await getScanState()
  const { count: scannedCount } = await supabase
    .from('scanned_emails')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({
    lastScanAt: scanState?.last_scan_completed_at || null,
    totalScannedMessages: scanState?.total_scanned_messages || 0,
    totalFoundInvoices: scanState?.total_found_invoices || 0,
    totalTrackedEmails: scannedCount || 0,
  })
}

// ─── POST: Run scan ───────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const maxMessages: number = body.maxMessages || 50
    const mode: 'quick' | 'full' = body.mode || 'quick'

    // Mark scan start
    await supabase
      .from('gmail_tokens')
      .update({ last_scan_started_at: new Date().toISOString() })
      .eq('id', 'default')

    const accessToken = await getGmailAccessToken()
    const authHeader = { Authorization: `Bearer ${accessToken}` }

    // Get already scanned email IDs (skip in quick mode)
    const alreadyScanned = mode === 'quick' ? await getAlreadyScannedIds() : new Set<string>()

    // Search Gmail for emails with attachments
    const searchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=has:attachment+filename:pdf&maxResults=${maxMessages}`,
      { headers: authHeader }
    )

    if (!searchRes.ok) {
      const errText = await searchRes.text()
      return NextResponse.json({ status: 'error', message: `Gmail API error: ${errText}` })
    }

    const searchData = await searchRes.json()
    const allMessages: { id: string }[] = searchData.messages || []

    // Filter out already scanned emails in quick mode
    const skippedAlreadyScanned = allMessages.filter((m) => alreadyScanned.has(m.id)).length
    const newMessages = mode === 'quick'
      ? allMessages.filter((m) => !alreadyScanned.has(m.id))
      : allMessages

    if (newMessages.length === 0) {
      const scanState = await getScanState()
      return NextResponse.json({
        status: 'ok',
        mode,
        created: 0,
        duplicates: 0,
        errors: 0,
        skipped: 0,
        skippedAlreadyScanned,
        totalChecked: allMessages.length,
        newChecked: 0,
        details: [],
        lastScanAt: scanState?.last_scan_completed_at || null,
      })
    }

    // Fetch message details in parallel
    const msgResults = await Promise.all(
      newMessages.map(({ id: msgId }) =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
          { headers: authHeader }
        ).then((r) => (r.ok ? r.json() : null))
      )
    )

    // Process each message
    interface AttachmentJob {
      msgId: string
      part: GmailPart
      sender: string
      subject: string
      emailDate: string | null
    }
    const attachmentJobs: AttachmentJob[] = []
    let skipped = 0

    for (const msg of msgResults) {
      if (!msg) {
        skipped++
        continue
      }

      const headers: GmailHeader[] = msg.payload?.headers || []
      const sender = extractEmailHeader(headers, 'From')
      const subject = extractEmailHeader(headers, 'Subject')
      const dateStr = extractEmailHeader(headers, 'Date')
      const emailDate = dateStr ? new Date(dateStr).toISOString() : null

      const parts: GmailPart[] = msg.payload?.parts || []
      const attachmentNames: string[] = []
      let foundAttachment = false

      for (const part of parts) {
        const isCandidate =
          (part.mimeType === 'application/pdf' ||
            part.mimeType?.startsWith('image/') ||
            (part.filename || '').toLowerCase().endsWith('.pdf')) &&
          part.body?.attachmentId

        if (!isCandidate) continue
        foundAttachment = true
        attachmentNames.push(part.filename || 'unknown')
        attachmentJobs.push({ msgId: msg.id, part, sender, subject, emailDate })
      }

      if (!foundAttachment) {
        skipped++
        await recordScannedEmail(msg.id, emailDate, sender, subject, [], 0, 'no_attachments')
      }
    }

    // Process attachments in batches of 5
    const allDetails: (ProcessResult | null)[] = []
    const emailInvoiceCounts = new Map<string, number>()
    const BATCH = 5

    for (let i = 0; i < attachmentJobs.length; i += BATCH) {
      const batch = attachmentJobs.slice(i, i + BATCH)
      const batchResults = await Promise.all(
        batch.map(async (job) => {
          const result = await processAttachment(accessToken, job.msgId, job.part)
          if (result?.status === 'created') {
            emailInvoiceCounts.set(job.msgId, (emailInvoiceCounts.get(job.msgId) || 0) + 1)
          }
          return { result, job }
        })
      )

      for (const { result, job } of batchResults) {
        allDetails.push(result)
        // Record scanned email
        await recordScannedEmail(
          job.msgId,
          job.emailDate,
          job.sender,
          job.subject,
          [job.part.filename || 'unknown'],
          result?.status === 'created' ? 1 : 0,
          result ? 'scanned' : 'error'
        )
      }
    }

    let created = 0,
      duplicates = 0,
      errors = 0
    const details: ProcessResult[] = []
    for (const result of allDetails) {
      if (!result) {
        skipped++
        continue
      }
      details.push(result)
      if (result.status === 'created') created++
      else if (result.status === 'duplicate') duplicates++
      else if (result.status === 'error') errors++
    }

    // Update scan state
    await updateScanState(newMessages.length, created)

    return NextResponse.json({
      status: 'ok',
      mode,
      created,
      duplicates,
      errors,
      skipped,
      skippedAlreadyScanned,
      totalChecked: allMessages.length,
      newChecked: newMessages.length,
      details,
      lastScanAt: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', message })
  }
}
