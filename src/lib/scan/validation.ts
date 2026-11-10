import { z } from 'zod'

// The body of POST /api/scan/save (the `data` field next to the photo): what Ronen approved in the
// review form. Amounts arrive as numbers (the form parsed them), the date as the form's YYYY-MM-DD.
// Anything the schema does not name is dropped — a client cannot set source, scanned_by, needs_review
// or any other column through this body.

const money = z.number().finite().min(-100_000_000).max(100_000_000)

export const scanSaveSchema = z.object({
  doc_type: z.string().trim().max(30),
  vendor: z.string().trim().max(200),
  vendor_tax_id: z.string().trim().max(20).default(''),
  doc_number: z.string().trim().max(100),
  /** YYYY-MM-DD, or '' when the receipt shows none. */
  date: z.string().trim().max(10),
  pretax: money.nullable(),
  vat: money.nullable(),
  total: money.nullable(),
  currency: z.string().trim().max(10),
  payment_method: z.string().trim().max(60).default(''),
  /** Pass-through of what the OCR read and no screen edits. */
  description: z.string().trim().max(300).default(''),
  category: z.string().trim().max(60).default(''),
  /** What the OCR read, before Ronen's edits — kept in extraction_raw for audit. Bounded. */
  ocr_ok: z.boolean().default(false),
  /** pretax / vat as the model READ them (before the derivation) — recorded as `original` when the server derives. */
  ocr_read: z.object({ pretax: money.nullable(), vat: money.nullable() }).nullable().optional(),
  ocr_fields: z
    .record(z.string(), z.unknown())
    .optional()
    .refine((v) => v === undefined || JSON.stringify(v).length <= 4000, 'ocr_fields_too_large'),
})

export type ScanSaveData = z.infer<typeof scanSaveSchema>

// The early warning asks about the document's identity (src/lib/doc-identity.ts): number, date, total, tax id.
// Vendor and doc type are not part of it; a client that still sends them is simply ignored (zod drops unknown keys).
export const duplicateQuerySchema = z.object({
  doc_number: z.string().trim().max(100),
  /** The form's YYYY-MM-DD, or ''. */
  date: z.string().trim().max(10).default(''),
  /** The form's typed total ("61.10", "1,234.50"), or ''. */
  total: z.string().trim().max(30).default(''),
  vendor_tax_id: z.string().trim().max(20).default(''),
})
