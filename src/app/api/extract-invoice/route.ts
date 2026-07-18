import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { parseExtractedJson } from '@/lib/ai-json-parse'
import {
  INVOICE_EXTRACTION_PROMPT,
  INVOICE_EXTRACTION_MODEL,
  INVOICE_EXTRACTION_MAX_TOKENS,
} from '@/lib/invoice-extraction-prompt'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { resolveFileUrl } from '@/lib/storage'
import { validateInvoiceArithmetic } from '@/lib/invoice-validation'
import { normalizeCurrency } from '@/lib/format'
import { normalizeDocType } from '@/lib/doc-type'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ponytail: force structured output via tool_use so the SDK returns parsed
// JSON — Hebrew values like `בע"מ` carry literal quotes that break JSON.parse
// on the raw text. Field docs stay in INVOICE_EXTRACTION_PROMPT.
const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'return_invoice',
  description: 'Return the extracted invoice fields.',
  input_schema: {
    type: 'object',
    properties: {
      date: { type: 'string' },
      vendor: { type: 'string' },
      doc_number: { type: 'string' },
      doc_type: {
        type: 'string',
        enum: ['invoice', 'receipt', 'invoice_receipt', 'credit_note', 'other', 'unknown'],
      },
      description: { type: 'string' },
      currency: { type: 'string' },
      pretax: { type: ['number', 'null'] },
      vat: { type: ['number', 'null'] },
      total: { type: ['number', 'null'] },
      payment_method: { type: 'string' },
      category: { type: 'string' },
    },
    required: ['date', 'vendor', 'total', 'currency'],
  },
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  try {
    const { file_url } = await request.json()

    if (!file_url) {
      return NextResponse.json({ error: 'file_url is required' }, { status: 400 })
    }

    const fetchUrl = await resolveFileUrl(file_url, 60)
    if (!fetchUrl) {
      return NextResponse.json({ error: 'הקובץ לא נמצא' }, { status: 404 })
    }
    const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(20000) })
    if (!response.ok) {
      return NextResponse.json({ error: 'הורדת הקובץ נכשלה' }, { status: 500 })
    }

    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const contentType = response.headers.get('content-type') || ''
    const isPdf = file_url.toLowerCase().endsWith('.pdf') || contentType.includes('pdf')

    type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    let imageMediaType: ImageMediaType = 'image/jpeg'
    if (contentType.includes('png')) imageMediaType = 'image/png'
    else if (contentType.includes('webp')) imageMediaType = 'image/webp'
    else if (contentType.includes('gif')) imageMediaType = 'image/gif'

    const fileBlock = isPdf
      ? {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
        }
      : {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: imageMediaType, data: base64 },
        }

    const result = await anthropic.messages.create({
      model: INVOICE_EXTRACTION_MODEL,
      max_tokens: INVOICE_EXTRACTION_MAX_TOKENS,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
      messages: [
        {
          role: 'user',
          content: [fileBlock, { type: 'text', text: INVOICE_EXTRACTION_PROMPT }],
        },
      ],
    })

    const toolBlock = result.content.find((b) => b.type === 'tool_use')
    const textBlock = result.content.find((b) => b.type === 'text')
    const text = textBlock && 'text' in textBlock ? textBlock.text : ''
    const stopReason = result.stop_reason

    try {
      // tool_use.input is already-parsed JSON; fall back to text parse only if
      // the model somehow returned no tool call.
      const data = (
        toolBlock && 'input' in toolBlock ? toolBlock.input : parseExtractedJson(text)
      ) as Record<string, unknown>
      data.currency = normalizeCurrency(data.currency)
      data.doc_type = normalizeDocType(data.doc_type)
      const validation = validateInvoiceArithmetic({
        pretax: typeof data.pretax === 'number' ? data.pretax : null,
        vat: typeof data.vat === 'number' ? data.vat : null,
        total: typeof data.total === 'number' ? data.total : null,
      })
      const extraction_raw = {
        model: INVOICE_EXTRACTION_MODEL,
        raw_text: text || JSON.stringify(data),
        parsed: data,
        validation_error: validation.reason,
        scanned_at: new Date().toISOString(),
        source: 'manual' as const,
      }
      return NextResponse.json({
        ...data,
        needs_review: !validation.ok,
        validation_error: validation.reason,
        extraction_raw,
      })
    } catch (parseErr) {
      console.error('[extract-invoice] JSON parse failed:', {
        file_url,
        stop_reason: stopReason,
        text_length: text.length,
        text_preview: text.slice(0, 500),
        text_tail: text.slice(-200),
        parse_error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      })
      const userMessage =
        stopReason === 'max_tokens'
          ? 'התשובה נחתכה — נסה שוב או פצל את הקובץ'
          : 'עיבוד התשובה נכשל'
      return NextResponse.json({ error: userMessage }, { status: 500 })
    }
  } catch (err) {
    console.error('[extract-invoice] error:', err)
    const message = err instanceof Error ? err.message : String(err)
    if (/credit balance|quota|rate.?limit/i.test(message)) {
      return NextResponse.json(
        { error: 'שירות ה-AI לא זמין כרגע — יתרת קרדיטים נמוכה' },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: 'חילוץ החשבונית נכשל' }, { status: 500 })
  }
}
