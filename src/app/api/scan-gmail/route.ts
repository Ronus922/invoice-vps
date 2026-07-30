import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getGmailAccessToken } from '@/lib/gmail'
import { parseExtractedJson } from '@/lib/ai-json-parse'
import { normalizeVendorName } from '@/lib/vendor-utils'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { validateInvoiceArithmetic } from '@/lib/invoice-validation'
import { sendInvoiceToAccountant, drainUnsentToAccountant } from '@/lib/accountant-send'
import { normalizeCurrency } from '@/lib/format'
import { normalizeDocType, isNonInvoiceDocType } from '@/lib/doc-type'
import { fetchWithRetry } from '@/lib/http-retry'
import {
  INVOICE_EXTRACTION_PROMPT,
  INVOICE_EXTRACTION_MODEL,
  INVOICE_EXTRACTION_MAX_TOKENS,
  EXTRACTION_TOOL,
} from '@/lib/invoice-extraction-prompt'
import { deriveVatFromTotal } from '@/lib/vat-derivation'
import { coerceRequiredIdentityFields } from '@/lib/invoice-write'
import { v4 as uuidv4 } from 'uuid'
import { safeEqual } from '@/lib/safe-compare'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// SDK retries 429/529/5xx with backoff natively; default is 2 attempts.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 4 })

// One scan at a time (mirrors backup-to-drive's activeRun): overlapping runs
// double-fetch Gmail and double-bill extraction. Module-level is safe — the
// standalone server is a single long-lived process.
let activeScan = false

function base64urlToBase64(b64url: string): string {
  return b64url.replace(/-/g, '+').replace(/_/g, '/')
}

// ─── Gmail Helpers ────────────────────────────────────────

async function fetchAttachmentData(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<string | null> {
  const res = await fetchWithRetry(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[scan-gmail] attachment fetch failed:', res.status, errText.slice(0, 300))
    return null
  }
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
  partId?: string
  filename?: string
  mimeType?: string
  body?: { attachmentId?: string; size?: number }
  parts?: GmailPart[]
  headers?: GmailHeader[]
}

const INLINE_IMAGE_SIZE_THRESHOLD = 30 * 1024

// Aligned with /api/upload (and nginx client_max_body_size).
const MAX_FILE_SIZE = 20 * 1024 * 1024

// Storage keys and content types derive from this allowlist — never from the
// sender-supplied filename/MIME header (path traversal / type spoofing).
const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

function collectAttachmentParts(part: GmailPart, acc: GmailPart[] = []): GmailPart[] {
  if (part.body?.attachmentId && part.filename) {
    acc.push(part)
  }
  for (const sub of part.parts || []) {
    collectAttachmentParts(sub, acc)
  }
  return acc
}

function isInlineDecorativeImage(part: GmailPart): boolean {
  const mimeType = (part.mimeType || '').toLowerCase()
  if (!mimeType.startsWith('image/')) return false

  const disposition =
    (part.headers || []).find((h) => h.name.toLowerCase() === 'content-disposition')?.value || ''
  if (disposition.toLowerCase().includes('inline')) return true

  const cid = (part.headers || []).find((h) => h.name.toLowerCase() === 'content-id')?.value || ''
  if (cid) return true

  const size = part.body?.size || 0
  if (size > 0 && size < INLINE_IMAGE_SIZE_THRESHOLD) return true

  return false
}

const POSITIVE_INVOICE_TERMS = [
  'חשבונית',
  'חשבונית מס',
  'קבלה',
  'invoice',
  'receipt',
  'taxinvoice',
  'tax invoice',
  'חשבונית-מס',
]

// 'statement' was removed on purpose: real invoices arrive as "Your monthly
// statement" (see isObviousNonInvoice's comment). 'דוחות' is listed explicitly
// because boundary matching stops 'דוח' from matching inside the plural.
const NEGATIVE_INVOICE_TERMS = [
  'הצעת מחיר',
  'quote',
  'proforma',
  'דוח',
  'דוחות',
  'report',
  'תעודת משלוח',
  'delivery note',
  'חוזה',
  'הסכם',
  'contract',
  'פרוטוקול',
  'מכתב',
  'כתב תביעה',
  'פסק דין',
]

// Bump whenever the veto rules above change — previously vetoed messages are
// re-opened exactly once under the new rules (see getSettledEmailIds).
const FILTER_VERSION = 2

interface ProcessResult {
  status: 'created' | 'duplicate' | 'error' | 'rejected'
  filename: string
  vendor?: string
  reason?: string
}

interface ProgressSnapshot {
  phase: 'search' | 'fetch_messages' | 'prepare_attachments' | 'process_attachments' | 'finalizing'
  processedMessages: number
  totalMessages: number
  processedAttachments: number
  totalAttachments: number
  created: number
  duplicates: number
  errors: number
  rejected: number
}

interface ExtractedInvoice {
  date?: string
  vendor?: string
  doc_number?: string
  doc_type?: string
  description?: string
  currency?: string
  pretax?: number
  vat?: number
  total?: number
  payment_method?: string
  category?: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Word-boundary matching that works for Hebrew (JS \b is ASCII-only): the
// term must not be immediately adjacent to another letter/digit. Stops 'דוח'
// from matching inside unrelated longer words.
function toBoundaryRegex(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term.toLowerCase())}(?![\\p{L}\\p{N}])`, 'iu')
}

const NEGATIVE_TERM_MATCHERS = NEGATIVE_INVOICE_TERMS.map((term) => ({
  term,
  re: toBoundaryRegex(term),
}))
const POSITIVE_TERM_MATCHERS = POSITIVE_INVOICE_TERMS.map((term) => ({
  term,
  re: toBoundaryRegex(term),
}))

function findTerm(value: string, matchers: { term: string; re: RegExp }[]): string | null {
  const normalized = value.toLowerCase()
  for (const { term, re } of matchers) {
    if (re.test(normalized)) return term
  }
  return null
}

interface NonInvoiceVerdict {
  skip: boolean
  reason?: string
}

// Veto ONLY on clear non-invoice signals. We do NOT require a positive match —
// many legitimate invoices arrive with neutral subjects like "Your monthly
// statement" or filenames like "INV-12345.pdf" that contain no positive
// keyword. We let the AI extractor be the truth and only short-circuit when
// the email/filename obviously says "this is not an invoice". A positive term
// ANYWHERE (subject, sender, or filename) overrides every negative — a file
// named "חשבונית מס 123 (תעודת משלוח).pdf" is an invoice, not a delivery note.
function isObviousNonInvoice(subject: string, sender: string, filename: string): NonInvoiceVerdict {
  const filenameLower = filename.toLowerCase()
  const subjectLower = `${subject} ${sender}`.toLowerCase().trim()

  const haystack = `${subjectLower} ${filenameLower}`
  if (findTerm(haystack, POSITIVE_TERM_MATCHERS)) return { skip: false }

  const negativeInFilename = filenameLower ? findTerm(filenameLower, NEGATIVE_TERM_MATCHERS) : null
  if (negativeInFilename) return { skip: true, reason: `negative_keyword:${negativeInFilename}` }

  const negativeInSubject = subjectLower ? findTerm(subjectLower, NEGATIVE_TERM_MATCHERS) : null
  if (negativeInSubject) return { skip: true, reason: `negative_keyword:${negativeInSubject}` }

  return { skip: false }
}

function isSupportedInvoiceFile(filename: string): boolean {
  const normalized = filename.toLowerCase()
  return (
    normalized.endsWith('.pdf') ||
    normalized.endsWith('.png') ||
    normalized.endsWith('.jpg') ||
    normalized.endsWith('.jpeg') ||
    normalized.endsWith('.webp')
  )
}

function toGmailAfterQuery(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const ts = new Date(isoDate).getTime()
  if (!Number.isFinite(ts)) return ''
  // Buffer one minute back to avoid timezone/clock edge misses.
  const seconds = Math.max(0, Math.floor(ts / 1000) - 60)
  return `after:${seconds}`
}

async function loadVendorCategoryMemory(): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('invoices')
    .select('vendor, category')
    .not('category', 'is', null)
    .limit(3000)

  const memory = new Map<string, string>()
  for (const row of data || []) {
    const vendor = String(row.vendor || '').trim()
    const category = String(row.category || '').trim()
    if (!vendor || !category) continue
    memory.set(normalizeVendorName(vendor), category)
  }

  return memory
}

// ─── Attachment Processing ────────────────────────────────

async function processAttachment(
  accessToken: string,
  messageId: string,
  part: GmailPart,
  vendorCategoryMemory: Map<string, string>,
  createdBy: string | null
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
  if (buffer.length === 0 || buffer.length > MAX_FILE_SIZE) {
    return { status: 'error', filename }
  }

  // Extension from the sender filename only when it's in the allowlist;
  // otherwise fall back to the declared MIME type. Both must agree with the
  // allowlist or the attachment is rejected.
  const extFromName = filename.toLowerCase().split('.').pop() || ''
  const ext = EXT_TO_CONTENT_TYPE[extFromName]
    ? extFromName
    : mimeType === 'application/pdf'
      ? 'pdf'
      : mimeType === 'image/png'
        ? 'png'
        : mimeType === 'image/jpeg'
          ? 'jpg'
          : mimeType === 'image/webp'
            ? 'webp'
            : ''
  const contentType = EXT_TO_CONTENT_TYPE[ext]
  if (!contentType) return { status: 'error', filename }

  const storagePath = `invoices/gmail_${Date.now()}_${uuidv4()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('invoice-files')
    .upload(storagePath, buffer, { contentType })

  if (uploadError) {
    console.error('[scan-gmail] upload failed:', uploadError, 'file:', filename)
    return { status: 'error', filename }
  }

  // The upload happens before extraction — duplicate/error exits must remove
  // the object or it leaks into the bucket forever (no GC job exists).
  const removeUploadedObject = async () => {
    const { error } = await supabase.storage.from('invoice-files').remove([storagePath])
    if (error) console.error('[scan-gmail] storage cleanup failed:', error, 'path:', storagePath)
  }

  const {
    data: { publicUrl: file_url },
  } = supabase.storage.from('invoice-files').getPublicUrl(storagePath)

  const isPdf = contentType === 'application/pdf'

  let rowCreated = false
  try {
    const result = await anthropic.messages.create({
      model: INVOICE_EXTRACTION_MODEL,
      max_tokens: INVOICE_EXTRACTION_MAX_TOKENS,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
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
                    media_type: contentType as 'image/jpeg' | 'image/png' | 'image/webp',
                    data: b64,
                  },
                },
            { type: 'text' as const, text: INVOICE_EXTRACTION_PROMPT },
          ],
        },
      ],
    })

    // tool_use.input is already-parsed JSON; fall back to text parse only if
    // the model somehow returned no tool call (Hebrew `בע"מ` quotes break
    // JSON.parse on raw text).
    const toolBlock = result.content.find((b) => b.type === 'tool_use')
    const textBlock = result.content.find((b) => b.type === 'text')
    const text = textBlock && 'text' in textBlock ? textBlock.text : ''
    const extracted = (
      toolBlock && 'input' in toolBlock ? toolBlock.input : parseExtractedJson(text)
    ) as ExtractedInvoice
    extracted.currency = normalizeCurrency(extracted.currency)
    extracted.doc_type = normalizeDocType(extracted.doc_type)

    // POSITIVE intake gate (policy 2026-07-30): only bookable documents enter
    // the system from email. 'other' (contracts, letters, quotes, legal docs)
    // is rejected outright — logged in scanned_emails.skipped_attachments,
    // never a review row for the user to triage. 'unknown' passes only with a
    // financial signal (an amount or a document number); manual/folder uploads
    // are deliberate and keep the softer review-flag behavior.
    const gateTotal = Number(extracted.total ?? 0)
    const hasFinancialSignal =
      (Number.isFinite(gateTotal) && gateTotal > 0) ||
      Boolean(String(extracted.doc_number ?? '').trim())
    const bookable =
      !isNonInvoiceDocType(extracted.doc_type) &&
      (extracted.doc_type !== 'unknown' || hasFinancialSignal)
    if (!bookable) {
      await removeUploadedObject()
      return {
        status: 'rejected',
        filename,
        vendor: extracted.vendor,
        reason: isNonInvoiceDocType(extracted.doc_type) ? 'ai_non_invoice' : 'no_financial_signal',
      }
    }

    const vendor = String(extracted.vendor || '').trim()
    if (vendor) {
      const remembered = vendorCategoryMemory.get(normalizeVendorName(vendor))
      if (remembered) {
        extracted.category = remembered
      }
    }

    // VAT fallback: when extraction left pretax/vat empty (or unbalanced) but
    // the total is valid, derive them from the total instead of flagging.
    const extractedPretax = extracted.pretax ?? null
    const extractedVat = extracted.vat ?? null
    const derivation = deriveVatFromTotal({
      pretax: extractedPretax,
      vat: extractedVat,
      total: extracted.total ?? null,
      currency: extracted.currency ?? null,
      date: extracted.date ?? null,
    })
    extracted.pretax = derivation.pretax ?? undefined
    extracted.vat = derivation.vat ?? undefined

    const validation = validateInvoiceArithmetic({
      pretax: derivation.pretax,
      vat: derivation.vat,
      total: extracted.total ?? null,
    })

    if (extracted.doc_number) {
      // Dedup on the full identity key (vendor, doc_number, doc_type): an Invoice
      // and a Receipt sharing one number are DIFFERENT documents and must both be
      // allowed. Re-scans of the same document get the same doc_type ⇒ deduped.
      const duplicateQuery = supabase
        .from('invoices')
        .select('id')
        .eq('doc_number', String(extracted.doc_number))
        .eq('doc_type', extracted.doc_type)
        .limit(1)

      if (vendor) {
        duplicateQuery.eq('vendor', vendor)
      }

      const { data: existing } = await duplicateQuery

      if (existing && existing.length > 0) {
        await removeUploadedObject()
        return { status: 'duplicate', filename, vendor: extracted.vendor }
      }
    }

    const insertPayload: Record<string, unknown> = {
      ...extracted,
      file_url,
      file_name: filename || `invoice_${Date.now()}.pdf`,
      source: 'gmail',
      created_by: createdBy,
      needs_review: !validation.ok,
      vat_derived: derivation.vatDerived,
      validation_error: validation.reason,
      extraction_raw: {
        model: INVOICE_EXTRACTION_MODEL,
        raw_text: text,
        parsed: extracted,
        validation_error: validation.reason,
        scanned_at: new Date().toISOString(),
        source: 'gmail',
        ...(derivation.vatDerived
          ? {
              vat_derivation: {
                rate: derivation.rate,
                derived_at: new Date().toISOString(),
                original: { pretax: extractedPretax, vat: extractedVat },
              },
            }
          : {}),
      },
    }
    // DB has NOT NULL on vendor/doc_number — coerce to '' + needs_review
    // instead of losing the invoice on an insert failure.
    coerceRequiredIdentityFields(insertPayload)

    // DB has NOT NULL on total. Mirror /api/invoices POST: a failed extraction
    // (total=null) still saves the file, flagged by the total<=0 validator —
    // otherwise the insert 23502s and the message retries (and re-bills) on
    // every scan forever.
    if (insertPayload.total == null) insertPayload.total = 0

    const { data: inserted, error: insertError } = await supabase
      .from('invoices')
      .insert(insertPayload)
      .select('id')
      .single()

    if (insertError) {
      // Unique index (vendor, doc_number, doc_type) — same document re-scanned.
      if (insertError.code === '23505') {
        await removeUploadedObject()
        return { status: 'duplicate', filename, vendor: extracted.vendor }
      }
      console.error('[scan-gmail] insert failed:', insertError, 'file:', filename)
      await removeUploadedObject()
      return { status: 'error', filename }
    }
    rowCreated = true

    if (vendor && extracted.category) {
      vendorCategoryMemory.set(normalizeVendorName(vendor), extracted.category)
    }

    const needsReview = Boolean(insertPayload.needs_review)
    try {
      // Awaited: fire-and-forget dropped the send silently when the process
      // restarted (deploy) mid-scan.
      await sendInvoiceToAccountant({
        invoiceId: inserted.id,
        fileUrl: file_url,
        fileName: filename || null,
        vendor: extracted.vendor,
        date: extracted.date,
        needsReview,
      })
    } catch (err) {
      console.error('[scan-gmail] accountant send error:', err)
    }

    return { status: 'created', filename, vendor: extracted.vendor }
  } catch (err) {
    console.error('[scan-gmail] extraction failed:', err, 'file:', filename, 'message:', messageId)
    // Never delete the object once a DB row references it.
    if (!rowCreated) await removeUploadedObject()
    return { status: 'error', filename }
  }
}

// ─── Scan State Helpers ───────────────────────────────────

// Bounded lookup: only the current search results are checked (the old
// unbounded full-table read silently truncated at PostgREST's 1000-row cap).
// A message is "settled" — skippable — only when it was fully scanned with
// nothing vetoed, or was vetoed under the CURRENT filter rules. Errored
// messages and messages vetoed under older rules are re-opened, so improving
// the classifier recovers past false vetoes without re-billing extraction for
// messages that already produced invoices.
async function getSettledEmailIds(candidateIds: string[]): Promise<Set<string>> {
  const settled = new Set<string>()
  const CHUNK = 100
  for (let i = 0; i < candidateIds.length; i += CHUNK) {
    const chunk = candidateIds.slice(i, i + CHUNK)
    const { data } = await supabase
      .from('scanned_emails')
      .select('email_id, scan_status, filter_version, skipped_attachments')
      .in('email_id', chunk)
    for (const row of data || []) {
      if (row.scan_status === 'error') continue // always retry errors
      const hadVetoes =
        row.scan_status === 'no_attachments' ||
        (Array.isArray(row.skipped_attachments) && row.skipped_attachments.length > 0)
      if (hadVetoes && (row.filter_version ?? 0) < FILTER_VERSION) continue
      settled.add(row.email_id)
    }
  }
  return settled
}

async function getScanState() {
  const { data } = await supabase
    .from('gmail_tokens')
    .select('last_scan_completed_at, total_scanned_messages, total_found_invoices')
    .eq('id', 'default')
    .single()
  return data
}

interface SkippedAttachment {
  filename: string
  reason: string
}

async function recordScannedEmail(
  emailId: string,
  emailDate: string | null,
  sender: string,
  subject: string,
  attachmentNames: string[],
  invoicesFound: number,
  scanStatus: 'scanned' | 'no_attachments' | 'error',
  skippedAttachments: SkippedAttachment[] = []
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
    skipped_attachments: skippedAttachments,
    filter_version: FILTER_VERSION,
  })
}

async function updateScanState(scannedCount: number, invoicesCount: number) {
  // Atomic SQL increment — the old read-then-write lost counts when two scans
  // overlapped (cron + manual).
  const { error } = await supabase.rpc('increment_scan_totals', {
    p_scanned: scannedCount,
    p_found: invoicesCount,
  })
  if (error) console.error('[scan-gmail] increment_scan_totals failed:', error)
}

// ─── Auth ─────────────────────────────────────────────────

async function authorize(
  request: NextRequest
): Promise<{ ok: true; userId: string | null } | { ok: false; res: ReturnType<typeof unauthorizedResponse> }> {
  const cronSecret = request.headers.get('x-cron-secret')
  if (cronSecret && process.env.CRON_SECRET && safeEqual(cronSecret, process.env.CRON_SECRET)) {
    return { ok: true, userId: null }
  }
  const user = await getAuthenticatedUser()
  if (user) return { ok: true, userId: user.id }
  return { ok: false, res: unauthorizedResponse() }
}

// ─── GET: Scan status ─────────────────────────────────────

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

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
  const auth = await authorize(request)
  if (!auth.ok) return auth.res
  const isCronRun = auth.userId === null
  const createdBy: string | null = auth.userId

  const body = await request.json().catch(() => ({}))
  const requestedMax = Number(body.maxMessages)
  const maxMessages = Number.isFinite(requestedMax)
    ? Math.min(Math.max(Math.floor(requestedMax), 1), 500)
    : 50
  const mode: 'quick' | 'full' = body.mode || 'quick'
  const allowRescan = Boolean(body.allowRescan)
  const streamProgress = Boolean(body.streamProgress)

  interface AttachmentJob {
    msgId: string
    part: GmailPart
    sender: string
    subject: string
    emailDate: string | null
  }

  const runScan = async (onProgress?: (snapshot: ProgressSnapshot) => void) => {
    const progress: ProgressSnapshot = {
      phase: 'search',
      processedMessages: 0,
      totalMessages: 0,
      processedAttachments: 0,
      totalAttachments: 0,
      created: 0,
      duplicates: 0,
      errors: 0,
      rejected: 0,
    }
    const report = () => onProgress?.({ ...progress })

    await supabase
      .from('gmail_tokens')
      .update({ last_scan_started_at: new Date().toISOString() })
      .eq('id', 'default')

    const accessToken = await getGmailAccessToken()
    const authHeader = { Authorization: `Bearer ${accessToken}` }
    const vendorCategoryMemory = await loadVendorCategoryMemory()
    const scanState = await getScanState()

    const incrementalAfter = mode === 'full' ? '' : toGmailAfterQuery(scanState?.last_scan_completed_at)
    // -in:spam -in:trash (not in:inbox): archived and label-filtered vendor
    // mail must still be scanned; the keyword filter + doc_type gate contain
    // the extra noise. -in:sent is CRITICAL: the accountant-send emails this
    // app sends carry the invoice PDFs — without it every sent invoice
    // re-enters the scan window and re-bills an extraction.
    const queryParts = [
      '-in:spam -in:trash -in:sent',
      'has:attachment',
      '(filename:pdf OR filename:jpg OR filename:jpeg OR filename:png OR filename:webp)',
      incrementalAfter,
    ].filter(Boolean)
    const gmailQuery = queryParts.join(' ')

    // Paginated search — a single page capped "full scan" at 200 messages.
    const allMessages: { id: string }[] = []
    let pageToken: string | undefined
    do {
      const pageSize = Math.min(100, maxMessages - allMessages.length)
      const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      const searchRes = await fetchWithRetry(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQuery)}&maxResults=${pageSize}${pageParam}`,
        { headers: authHeader }
      )
      if (!searchRes.ok) {
        const errText = await searchRes.text()
        throw new Error(`Gmail API error: ${errText}`)
      }
      const searchData = await searchRes.json()
      allMessages.push(...((searchData.messages || []) as { id: string }[]))
      pageToken = searchData.nextPageToken
    } while (pageToken && allMessages.length < maxMessages)

    const alreadyScanned = allowRescan
      ? new Set<string>()
      : await getSettledEmailIds(allMessages.map((m) => m.id))
    const skippedAlreadyScanned = allMessages.filter((m) => alreadyScanned.has(m.id)).length
    const newMessages = allMessages.filter((m) => !alreadyScanned.has(m.id))

    progress.totalMessages = newMessages.length
    progress.phase = 'fetch_messages'
    report()

    if (newMessages.length === 0) {
      await updateScanState(0, 0)
      // Safety net: retry anything left unsent by previous runs/crashes.
      const drained = await drainUnsentToAccountant()
      return {
        status: 'ok' as const,
        mode,
        created: 0,
        duplicates: 0,
        errors: 0,
        rejected: 0,
        skipped: 0,
        skippedAlreadyScanned,
        totalChecked: allMessages.length,
        newChecked: 0,
        details: [],
        drained,
        lastScanAt: new Date().toISOString(),
      }
    }

    // Batches of 5 (like attachments): Gmail's quota is 250 units/user/sec
    // and messages.get costs 5 — an unbounded fan-out over 200+ messages
    // guaranteed 429s.
    interface GmailMessageDetail {
      id: string
      payload?: GmailPart
    }
    const msgResults: (GmailMessageDetail | null)[] = []
    const MSG_BATCH = 5
    for (let i = 0; i < newMessages.length; i += MSG_BATCH) {
      const batch = newMessages.slice(i, i + MSG_BATCH)
      const results = await Promise.all(
        batch.map(({ id: msgId }) =>
          fetchWithRetry(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
            { headers: authHeader }
          )
            .then((r) => (r.ok ? (r.json() as Promise<GmailMessageDetail>) : null))
            .catch(() => null)
        )
      )
      msgResults.push(...results)
    }

    progress.phase = 'prepare_attachments'
    const attachmentJobs: AttachmentJob[] = []
    // Per-message veto log — persisted to scanned_emails.skipped_attachments
    // so rejections are auditable and replayable when the filter improves.
    const skipMap = new Map<string, SkippedAttachment[]>()
    let skipped = 0

    for (const msg of msgResults) {
      progress.processedMessages += 1
      report()
      if (!msg) {
        skipped++
        continue
      }

      const headers: GmailHeader[] = msg.payload?.headers || []
      const sender = extractEmailHeader(headers, 'From')
      const subject = extractEmailHeader(headers, 'Subject')
      const dateStr = extractEmailHeader(headers, 'Date')
      const emailDate = dateStr ? new Date(dateStr).toISOString() : null

      const candidateParts = collectAttachmentParts(msg.payload || {})
      const skippedParts: SkippedAttachment[] = []
      let foundAttachment = false

      for (const part of candidateParts) {
        const filename = part.filename || ''
        if (!isSupportedInvoiceFile(filename)) {
          skippedParts.push({ filename, reason: 'unsupported_type' })
          continue
        }
        if ((part.body?.size || 0) > MAX_FILE_SIZE) {
          skippedParts.push({ filename, reason: 'too_large' })
          continue
        }
        if (isInlineDecorativeImage(part)) {
          skippedParts.push({ filename, reason: 'inline_image' })
          continue
        }
        const verdict = isObviousNonInvoice(subject, sender, filename)
        if (verdict.skip) {
          skippedParts.push({ filename, reason: verdict.reason || 'negative_keyword' })
          continue
        }

        foundAttachment = true
        attachmentJobs.push({ msgId: msg.id, part, sender, subject, emailDate })
      }

      if (!foundAttachment) {
        skipped++
        await recordScannedEmail(msg.id, emailDate, sender, subject, [], 0, 'no_attachments', skippedParts)
      } else if (skippedParts.length > 0) {
        skipMap.set(msg.id, skippedParts)
      }
    }

    progress.totalAttachments = attachmentJobs.length
    progress.phase = 'process_attachments'
    report()

    const allDetails: (ProcessResult | null)[] = []
    const BATCH = 5

    // One scanned_emails row per message: accumulate all its attachments and
    // upsert once, instead of a per-attachment upsert that overwrites siblings.
    interface EmailScanSummary {
      emailDate: string | null
      sender: string
      subject: string
      names: string[]
      found: number
      anyError: boolean
    }
    const emailSummaries = new Map<string, EmailScanSummary>()
    // AI-rejected attachments (non-invoice verdict) — merged into the
    // message's skipped_attachments log alongside the keyword-filter vetoes.
    const aiRejects = new Map<string, SkippedAttachment[]>()

    for (let i = 0; i < attachmentJobs.length; i += BATCH) {
      const batch = attachmentJobs.slice(i, i + BATCH)
      const batchResults = await Promise.all(
        batch.map(async (job) => {
          const result = await processAttachment(
            accessToken,
            job.msgId,
            job.part,
            vendorCategoryMemory,
            createdBy
          )
          return { result, job }
        })
      )

      for (const { result, job } of batchResults) {
        allDetails.push(result)
        progress.processedAttachments += 1
        if (!result) {
          progress.errors += 1
        } else if (result.status === 'created') {
          progress.created += 1
        } else if (result.status === 'duplicate') {
          progress.duplicates += 1
        } else if (result.status === 'rejected') {
          progress.rejected += 1
        } else {
          progress.errors += 1
        }
        report()

        const summary = emailSummaries.get(job.msgId) || {
          emailDate: job.emailDate,
          sender: job.sender,
          subject: job.subject,
          names: [],
          found: 0,
          anyError: false,
        }
        summary.names.push(job.part.filename || 'unknown')
        if (result?.status === 'created') summary.found += 1
        // A failed attachment must mark the whole message 'error' — that
        // status is what re-opens it on the next scan (getSettledEmailIds).
        if (!result || result.status === 'error') summary.anyError = true
        if (result?.status === 'rejected') {
          const list = aiRejects.get(job.msgId) || []
          list.push({ filename: result.filename, reason: result.reason || 'ai_non_invoice' })
          aiRejects.set(job.msgId, list)
        }
        emailSummaries.set(job.msgId, summary)
      }
    }

    for (const [msgId, summary] of emailSummaries) {
      await recordScannedEmail(
        msgId,
        summary.emailDate,
        summary.sender,
        summary.subject,
        summary.names,
        summary.found,
        summary.anyError ? 'error' : 'scanned',
        [...(skipMap.get(msgId) || []), ...(aiRejects.get(msgId) || [])]
      )
    }

    progress.phase = 'finalizing'
    report()

    let created = 0
    let duplicates = 0
    let errors = 0
    let rejected = 0
    const details: ProcessResult[] = []

    for (const result of allDetails) {
      if (!result) {
        skipped++
        continue
      }
      details.push(result)
      if (result.status === 'created') created++
      else if (result.status === 'duplicate') duplicates++
      else if (result.status === 'rejected') rejected++
      else if (result.status === 'error') errors++
    }

    await updateScanState(newMessages.length, created)
    // Safety net: retry anything left unsent by previous runs/crashes.
    const drained = await drainUnsentToAccountant()

    return {
      status: 'ok' as const,
      mode,
      created,
      duplicates,
      errors,
      rejected,
      skipped,
      skippedAlreadyScanned,
      totalChecked: allMessages.length,
      newChecked: newMessages.length,
      details,
      drained,
      lastScanAt: new Date().toISOString(),
    }
  }

  // Reject overlapping scans (cron 02:30 vs a manual click, or two tabs) —
  // they double-fetch Gmail and double-bill extraction.
  if (activeScan) {
    return NextResponse.json({ status: 'error', message: 'סריקה כבר פועלת' }, { status: 409 })
  }
  activeScan = true

  if (!streamProgress) {
    try {
      const result = await runScan()
      if (isCronRun) {
        console.info(
          '[scan-gmail] auto-scan completed: created=%d duplicates=%d errors=%d drained=%d/%d',
          result.created,
          result.duplicates,
          result.errors,
          result.drained?.sent ?? 0,
          result.drained?.attempted ?? 0
        )
      }
      return NextResponse.json(result)
    } catch (err) {
      console.error('[scan-gmail] error:', err)
      return NextResponse.json({ status: 'error', message: 'סריקת המייל נכשלה' })
    } finally {
      activeScan = false
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }

      try {
        const result = await runScan((snapshot) => {
          send({ type: 'progress', ...snapshot })
        })
        send({ type: 'result', data: result })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        send({ type: 'error', message })
      } finally {
        activeScan = false
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
