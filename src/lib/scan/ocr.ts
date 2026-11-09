import Anthropic from '@anthropic-ai/sdk'
import {
  INVOICE_EXTRACTION_MAX_TOKENS,
  INVOICE_EXTRACTION_MODEL,
  INVOICE_EXTRACTION_PROMPT,
  SCAN_CONFIDENCE_FIELDS,
  SCAN_EXTRACTION_PROMPT_ADDENDUM,
  SCAN_EXTRACTION_TOOL,
} from '@/lib/invoice-extraction-prompt'
import { normalizeDocType } from '@/lib/doc-type'
import { normalizeCurrency } from '@/lib/format'
import { deriveVatFromTotal } from '@/lib/vat-derivation'
import { formatAmount, normalizeConfidence, toIsoDate } from './format'
import { EMPTY_SCAN_VALUES, type ScanConfidence, type ScanPassthrough, type ScanValues } from './model'

// Reads a photographed receipt with Claude's vision — the SAME call the e-mail and manual-upload
// paths make (forced tool_use, `return_invoice`, INVOICE_EXTRACTION_MODEL, the same prompt), with
// the tool's schema widened by the issuer's tax id and a per-field confidence
// (SCAN_EXTRACTION_TOOL). The result PRE-FILLS a form that Ronen reviews and corrects — it is never
// saved on its own — so a wrong read costs a correction, not a wrong record.

export interface ParsedScan {
  fields: ScanValues
  passthrough: ScanPassthrough
  confidence: ScanConfidence
  vatDerived: boolean
  /** pretax / vat exactly as the model READ them, before the derivation filled them in. */
  readAmounts: { pretax: number | null; vat: number | null }
  /** The model's tool input exactly as received (diagnostics and tests; what is stored for audit is the form
   *  snapshot the save step receives, see extraction_raw.parsed). */
  raw: Record<string, unknown>
}

const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''

/** The issuer's tax id: digits only (a ח.פ / ע.מ is 8–9 digits; a stray letter or dash is dropped). */
export function normalizeTaxId(v: unknown): string {
  const digits = typeof v === 'string' ? v.replace(/\D/g, '') : typeof v === 'number' ? String(v) : ''
  return digits.length >= 5 && digits.length <= 12 ? digits : ''
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** The pure half of the OCR: turn the model's tool input into the shape the form takes — the same
 *  post-processing the manual extraction applies (currency, doc type, VAT derivation from the total). No I/O. */
export function parseScanExtraction(input: unknown): ParsedScan | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null
  const o = input as Record<string, unknown>

  const currency = normalizeCurrency(o.currency)
  const docType = normalizeDocType(o.doc_type)
  const total = num(o.total)
  const derivation = deriveVatFromTotal({
    pretax: num(o.pretax),
    vat: num(o.vat),
    total,
    currency,
    // the ISO form when the date is real: parseInvoiceDate reads DD.MM.YYYY as month/day, the ISO form never
    date: toIsoDate(o.date) || (typeof o.date === 'string' ? o.date : null),
  })

  const fields: ScanValues = {
    ...EMPTY_SCAN_VALUES,
    doc_type: docType,
    vendor: clean(o.vendor, 200),
    vendor_tax_id: normalizeTaxId(o.vendor_tax_id),
    doc_number: clean(o.doc_number, 100),
    date: toIsoDate(o.date),
    pretax: formatAmount(derivation.pretax),
    vat: formatAmount(derivation.vat),
    total: formatAmount(total),
    currency,
    payment_method: clean(o.payment_method, 60),
  }

  const confidence: ScanConfidence = {}
  const rawConf = o.confidence !== null && typeof o.confidence === 'object' ? (o.confidence as Record<string, unknown>) : {}
  for (const key of SCAN_CONFIDENCE_FIELDS) {
    const c = normalizeConfidence(rawConf[key])
    if (c !== undefined) confidence[key] = c
  }

  return {
    fields,
    passthrough: { description: clean(o.description, 300), category: clean(o.category, 60) },
    confidence,
    vatDerived: derivation.vatDerived,
    readAmounts: { pretax: num(o.pretax), vat: num(o.vat) },
    raw: o,
  }
}

export interface OcrOutcome {
  ok: boolean
  parsed: ParsedScan | null
  /** Why it did not read: absent when ok. */
  reason?: 'not_configured' | 'failed' | 'unreadable'
}

/** A client that never retries or waits past nginx's 60s: one attempt, then the screen shows an empty form. */
function makeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, timeout: 40_000, maxRetries: 0 })
}

/** Never throws — on any failure the form simply opens empty. `client` is a test seam. */
export async function readReceipt(image: Buffer, mediaType: 'image/jpeg', client?: Anthropic): Promise<OcrOutcome> {
  let anthropic = client
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { ok: false, parsed: null, reason: 'not_configured' }
    anthropic = makeClient(apiKey)
  }

  try {
    const res = await anthropic.messages.create({
      model: INVOICE_EXTRACTION_MODEL,
      max_tokens: INVOICE_EXTRACTION_MAX_TOKENS,
      tools: [SCAN_EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: SCAN_EXTRACTION_TOOL.name },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image.toString('base64') } },
            { type: 'text', text: INVOICE_EXTRACTION_PROMPT + SCAN_EXTRACTION_PROMPT_ADDENDUM },
          ],
        },
      ],
    })
    const toolBlock = res.content.find((b) => b.type === 'tool_use')
    const parsed = toolBlock && 'input' in toolBlock ? parseScanExtraction(toolBlock.input) : null
    if (!parsed) return { ok: false, parsed: null, reason: 'unreadable' }
    return { ok: true, parsed }
  } catch (err) {
    // The message of an API error never carries the image; log the class and status only.
    const status = err instanceof Anthropic.APIError ? err.status : undefined
    console.error('[scan ocr] failed', { name: err instanceof Error ? err.name : 'unknown', status })
    return { ok: false, parsed: null, reason: 'failed' }
  }
}
