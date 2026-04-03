import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const { file_url } = await request.json()

    if (!file_url) {
      return NextResponse.json({ error: 'file_url is required' }, { status: 400 })
    }

    // Download the file
    const response = await fetch(file_url)
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
    }

    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const isPdf = file_url.toLowerCase().endsWith('.pdf')
    const mediaType = isPdf ? 'application/pdf' : 'image/jpeg'

    type ContentBlock =
      | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'text'; text: string }

    const contentBlocks: ContentBlock[] = [
      isPdf
        ? {
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: mediaType, data: base64 },
          }
        : {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: mediaType, data: base64 },
          },
      {
        type: 'text' as const,
        text: `Extract invoice data from this document. Return ONLY a JSON object with these fields:
{
  "date": "DD/MM/YYYY format",
  "vendor": "vendor/supplier name in Hebrew if possible",
  "doc_number": "invoice/receipt number",
  "description": "short description in Hebrew",
  "pretax": number (amount before VAT in NIS),
  "vat": number (VAT amount in NIS),
  "total": number (total including VAT in NIS),
  "payment_method": "payment method in Hebrew if visible (e.g. אשראי, העברה בנקאית, מזומן)",
  "category": "one of: תוכנה, ענן, חשמל, ציוד משרדי, שירותים, תקשורת, ביטוח, שכירות, משלוח, שיווק, הדרכה, תחזוקה, נסיעות, אירוח, אחר"
}
Return ONLY valid JSON, no markdown code fences.`,
      },
    ]

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: contentBlocks as any,
        },
      ],
    })

    const textBlock = result.content.find((b) => b.type === 'text')
    const text = textBlock && 'text' in textBlock ? textBlock.text : ''

    try {
      // Try to parse, stripping possible markdown fences
      const cleaned = text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
      const data = JSON.parse(cleaned)
      return NextResponse.json(data)
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse AI extraction result', raw: text },
        { status: 500 }
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
