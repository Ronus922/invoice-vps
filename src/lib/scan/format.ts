import { OCR_LOW_CONFIDENCE, type ScanConfidence, type ScanField, type ScanPassthrough, type ScanValues } from './model'

// Pure helpers shared by the OCR parse (server), the save validation (server) and the
// review form (browser): dates, amounts, the low-confidence marks. No I/O, no React.

const pad2 = (n: number) => String(n).padStart(2, '0')

/** True for a real calendar day (rejects 31/02 and the like). */
function isRealDay(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** `YYYY-MM-DD` (an <input type="date"> value) from what a receipt prints or the model returns:
 *  DD/MM/YYYY, DD.MM.YY, DD-MM-YYYY or already ISO. '' when it is not a real date. */
export function toIsoDate(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const s = raw.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (iso) return isRealDay(+iso[1]!, +iso[2]!, +iso[3]!) ? s : ''
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s)
  if (!dmy) return ''
  const year = dmy[3]!.length === 2 ? 2000 + +dmy[3]! : +dmy[3]!
  return isRealDay(year, +dmy[2]!, +dmy[1]!) ? `${year}-${pad2(+dmy[2]!)}-${pad2(+dmy[1]!)}` : ''
}

/** The table's own date format: `DD/MM/YYYY` (what the extraction prompt asks for and every existing row
 *  holds), from the form's `YYYY-MM-DD`. null when empty / not a real date. */
export function toStoredDate(iso: string): string | null {
  const ok = toIsoDate(iso)
  if (!ok) return null
  const [y, m, d] = ok.split('-')
  return `${d}/${m}/${y}`
}

/** `YYYY-MM-DD` from a stored date (`DD/MM/YYYY`, or an ISO value some path stored) — for the download name. */
export function fromStoredDate(stored: string | null | undefined): string {
  return toIsoDate(stored ?? '')
}

/** A typed amount as a number: "1,234.50" and "1234,5" both work; '' / junk → null. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/[^\d.,-]/g, '')
  if (s === '' || s === '-') return null
  // A lone comma with no dot and 1–2 digits after it is a decimal comma; otherwise commas are thousands separators.
  const normalized = /^-?\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** An amount as the form shows it. */
export function formatAmount(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : ''
}

/** 0–1. A model that answers on a 0–100 scale is read as a percentage. */
export function normalizeConfidence(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return undefined
  if (v <= 1) return v
  return v <= 100 ? v / 100 : undefined
}

/** The fields to paint yellow: read (non-empty) but below the confidence threshold. */
export function lowConfidenceFields(values: ScanValues, confidence: ScanConfidence): ReadonlySet<ScanField> {
  const out = new Set<ScanField>()
  for (const [key, c] of Object.entries(confidence) as [ScanField, number][]) {
    if (c < OCR_LOW_CONFIDENCE && (values[key] ?? '') !== '') out.add(key)
  }
  return out
}

/** The body POST /api/scan/save takes as `data` (see scanSaveSchema): what Ronen approved in the form. */
export function toSavePayload(
  values: ScanValues,
  passthrough: ScanPassthrough,
  ocr: { ok: boolean; fields: ScanValues },
) {
  return {
    doc_type: values.doc_type,
    vendor: values.vendor.trim(),
    vendor_tax_id: values.vendor_tax_id.trim(),
    doc_number: values.doc_number.trim(),
    date: values.date,
    pretax: parseAmount(values.pretax),
    vat: parseAmount(values.vat),
    total: parseAmount(values.total),
    currency: values.currency,
    payment_method: values.payment_method.trim(),
    description: passthrough.description,
    category: passthrough.category,
    ocr_ok: ocr.ok,
    ocr_fields: { ...ocr.fields },
  }
}
