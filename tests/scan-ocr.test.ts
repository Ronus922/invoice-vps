import { describe, it, expect, vi, afterEach } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import {
  EXTRACTION_TOOL, INVOICE_EXTRACTION_MAX_TOKENS, INVOICE_EXTRACTION_MODEL, INVOICE_EXTRACTION_PROMPT,
  SCAN_CONFIDENCE_FIELDS, SCAN_EXTRACTION_PROMPT_ADDENDUM, SCAN_EXTRACTION_TOOL,
} from '@/lib/invoice-extraction-prompt'
import { normalizeTaxId, parseScanExtraction, readReceipt } from '@/lib/scan/ocr'
import { SCAN_FIELDS } from '@/lib/scan/model'

// The OCR is the SAME call the e-mail and manual-upload paths make, widened by two optional fields.
// Everything here runs against a stub client — no network, no key.

afterEach(() => vi.unstubAllEnvs())

const stub = (reply: unknown) => {
  const create = vi.fn<(args: unknown) => Promise<unknown>>(typeof reply === 'function' ? (reply as () => Promise<unknown>) : async () => reply)
  return { client: { messages: { create } } as unknown as Anthropic, create }
}

interface SentRequest {
  model: string
  max_tokens: number
  tool_choice: unknown
  tools: unknown[]
  messages: { content: [{ type: string; source: { type: string; media_type: string; data: string } }, { type: string; text: string }] }[]
}

const toolReply = (input: unknown) => ({ content: [{ type: 'tool_use', id: 't1', name: 'return_invoice', input }], stop_reason: 'tool_use' })

const RECEIPT = {
  date: '09/11/2026', vendor: 'שופרסל דיל בע"מ', doc_number: '4455', doc_type: 'חשבונית מס קבלה', description: 'מצרכים',
  currency: '₪', pretax: null, vat: null, total: 118, payment_method: 'אשראי', category: 'אחר', vendor_tax_id: '51-2345678',
  confidence: { vendor: 0.95, doc_number: 0.4, total: 0.99, date: 0.9, bogus: 0.1 },
}

describe('the scan tool is the existing tool, widened — never a second schema', () => {
  it('keeps every property, the name and the required list of return_invoice exactly', () => {
    expect(SCAN_EXTRACTION_TOOL.name).toBe(EXTRACTION_TOOL.name)
    expect(SCAN_EXTRACTION_TOOL.description).toBe(EXTRACTION_TOOL.description)
    expect(SCAN_EXTRACTION_TOOL.input_schema.required).toEqual(EXTRACTION_TOOL.input_schema.required)
    for (const [key, schema] of Object.entries(EXTRACTION_TOOL.input_schema.properties)) {
      expect(SCAN_EXTRACTION_TOOL.input_schema.properties).toHaveProperty(key, schema)
    }
  })
  it('adds only vendor_tax_id and a per-field confidence, both optional', () => {
    const added = Object.keys(SCAN_EXTRACTION_TOOL.input_schema.properties).filter((k) => !(k in EXTRACTION_TOOL.input_schema.properties))
    expect(added.sort()).toEqual(['confidence', 'vendor_tax_id'])
    expect(SCAN_EXTRACTION_TOOL.input_schema.required).not.toContain('vendor_tax_id')
    expect(SCAN_EXTRACTION_TOOL.input_schema.required).not.toContain('confidence')
    expect(Object.keys(SCAN_EXTRACTION_TOOL.input_schema.properties.confidence.properties).sort()).toEqual([...SCAN_CONFIDENCE_FIELDS].sort())
  })
  it('the confidence keys are exactly the form fields', () => {
    expect([...SCAN_CONFIDENCE_FIELDS].sort()).toEqual([...SCAN_FIELDS].sort())
  })
})

describe('readReceipt', () => {
  it('makes the same call as the manual path: same model, same max_tokens, forced tool, the shared prompt first', async () => {
    const { client, create } = stub(toolReply(RECEIPT))
    const out = await readReceipt(Buffer.from([0xff, 0xd8, 1, 2, 3]), 'image/jpeg', client)
    expect(out.ok).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
    const args = create.mock.calls[0]![0] as SentRequest
    expect(args.model).toBe(INVOICE_EXTRACTION_MODEL)
    expect(args.max_tokens).toBe(INVOICE_EXTRACTION_MAX_TOKENS)
    expect(args.tool_choice).toEqual({ type: 'tool', name: 'return_invoice' })
    expect(args.tools).toEqual([SCAN_EXTRACTION_TOOL])
    const [image, text] = args.messages[0].content
    expect(image).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } })
    expect(image.source.data).toBe(Buffer.from([0xff, 0xd8, 1, 2, 3]).toString('base64'))
    expect(text.text.startsWith(INVOICE_EXTRACTION_PROMPT)).toBe(true)
    expect(text.text.endsWith(SCAN_EXTRACTION_PROMPT_ADDENDUM)).toBe(true)
  })

  it('turns the reply into the form: Hebrew doc type, ISO date, derived VAT, tax id digits, confidences', async () => {
    const { client } = stub(toolReply(RECEIPT))
    const { parsed } = await readReceipt(Buffer.alloc(8), 'image/jpeg', client)
    expect(parsed!.fields).toEqual({
      doc_type: 'invoice_receipt', vendor: 'שופרסל דיל בע"מ', vendor_tax_id: '512345678', doc_number: '4455', date: '2026-11-09',
      pretax: '100.00', vat: '18.00', total: '118.00', currency: 'ILS', payment_method: 'אשראי',
    })
    expect(parsed!.vatDerived).toBe(true) // pretax and vat were not read: derived from the total at the 2026 rate
    expect(parsed!.readAmounts).toEqual({ pretax: null, vat: null }) // what the model READ, kept apart from what was filled in
    expect(parsed!.confidence).toEqual({ vendor: 0.95, doc_number: 0.4, total: 0.99, date: 0.9 }) // "bogus" is not a field
    expect(parsed!.passthrough).toEqual({ description: 'מצרכים', category: 'אחר' })
  })

  it('without a key it does not call out and the form opens empty', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const out = await readReceipt(Buffer.alloc(8), 'image/jpeg')
    expect(out).toEqual({ ok: false, parsed: null, reason: 'not_configured' })
  })

  it('never throws: an API failure, a reply with no tool call, or a non-object all give an empty form', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failing = stub(async () => { throw new Error('boom') })
    expect(await readReceipt(Buffer.alloc(8), 'image/jpeg', failing.client)).toMatchObject({ ok: false, reason: 'failed' })
    const textOnly = stub({ content: [{ type: 'text', text: 'sorry' }] })
    expect(await readReceipt(Buffer.alloc(8), 'image/jpeg', textOnly.client)).toMatchObject({ ok: false, reason: 'unreadable' })
    const junk = stub(toolReply('not an object'))
    expect(await readReceipt(Buffer.alloc(8), 'image/jpeg', junk.client)).toMatchObject({ ok: false, reason: 'unreadable' })
    quiet.mockRestore()
  })
})

describe('parseScanExtraction', () => {
  it('keeps a balanced pair as read and does not mark it derived', () => {
    const p = parseScanExtraction({ date: '01/03/2026', vendor: 'A', total: 118, pretax: 100, vat: 18, currency: 'ILS', doc_type: 'invoice' })!
    expect([p.fields.pretax, p.fields.vat, p.vatDerived]).toEqual(['100.00', '18.00', false])
  })
  it('derives with the real date even when the receipt prints DD.MM.YYYY (Date() would read it as month/day)', () => {
    const p = parseScanExtraction({ date: '15.03.2024', vendor: 'A', total: 117, currency: 'ILS', doc_type: 'invoice' })!
    expect([p.fields.date, p.fields.pretax, p.fields.vat]).toEqual(['2024-03-15', '100.00', '17.00']) // the 17% era
  })
  it('keeps the amounts the model read apart from the derived ones', () => {
    const p = parseScanExtraction({ date: '01/03/2026', vendor: 'A', total: 118, pretax: 50, vat: 3, currency: 'ILS', doc_type: 'invoice' })!
    expect(p.readAmounts).toEqual({ pretax: 50, vat: 3 })
    expect([p.fields.pretax, p.fields.vat, p.vatDerived]).toEqual(['100.00', '18.00', true]) // unbalanced: the total wins (Ronen's policy)
  })
  it('a negative total (credit note) derives a negative VAT, like the manual path', () => {
    const p = parseScanExtraction({ date: '01/03/2026', vendor: 'A', total: -118, currency: 'ILS', doc_type: 'credit_note' })!
    expect([p.fields.pretax, p.fields.vat]).toEqual(['-100.00', '-18.00'])
  })
  it('a foreign-currency receipt carries no Israeli VAT', () => {
    const p = parseScanExtraction({ date: '01/03/2026', vendor: 'AWS', total: 50, currency: 'USD', doc_type: 'invoice' })!
    expect([p.fields.currency, p.fields.pretax, p.fields.vat]).toEqual(['USD', '50.00', '0.00'])
  })
  it('only the known fields get through — text on the paper cannot add columns', () => {
    const p = parseScanExtraction({ vendor: 'A', total: 1, doc_type: 'invoice', currency: 'ILS', source: 'gmail', needs_review: false, __proto__: { x: 1 }, evil: 'DROP' })!
    expect(Object.keys(p.fields).sort()).toEqual([...SCAN_FIELDS].sort())
    expect(JSON.stringify(p.fields)).not.toContain('DROP')
  })
  it('an unreadable receipt gives empty strings, never null or "undefined"', () => {
    const p = parseScanExtraction({})!
    expect(p.fields).toMatchObject({ vendor: '', doc_number: '', date: '', total: '', pretax: '', vat: '', doc_type: 'unknown', currency: 'ILS' })
  })
  it('refuses anything that is not an object', () => {
    for (const bad of [null, undefined, 'x', 5, []]) expect(parseScanExtraction(bad)).toBeNull()
  })
  it('tax ids: digits only, 5–12 of them', () => {
    expect(normalizeTaxId('ע.מ 51-234567-8')).toBe('512345678')
    expect(normalizeTaxId(514123456)).toBe('514123456')
    expect(normalizeTaxId('12')).toBe('')
    expect(normalizeTaxId('1'.repeat(13))).toBe('')
    expect(normalizeTaxId(null)).toBe('')
  })
})
