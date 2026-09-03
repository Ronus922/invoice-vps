import { parseInvoiceDate } from '@/lib/date-utils'

// Deterministic VAT fallback: when the model could not extract pretax/vat
// (both null) or the extracted pair does not reconcile with the printed total,
// we trust the total and derive pretax/vat from it at the date-appropriate
// Israeli VAT rate. The extraction prompt deliberately forbids the model from
// computing these itself.
//
// Mirrored logic (keep in sync):
//   scripts/backfill-derive-vat.mjs   (one-off backfill over existing rows)
//   scripts/check-money-balanced.mjs  (SQL invariant on derived rows)

export interface VatDerivationInput {
  pretax: number | null
  vat: number | null
  total: number | null
  currency?: string | null
  date?: string | null
}

export interface VatDerivationResult {
  pretax: number | null
  vat: number | null
  vatDerived: boolean
  rate: number | null
}

const VAT_RATE_CURRENT = 0.18

// Israeli VAT rate periods, most recent first.
const VAT_RATE_PERIODS: Array<{ from: string; rate: number }> = [
  { from: '2025-01-01', rate: 0.18 },
  { from: '2015-10-01', rate: 0.17 },
  { from: '1900-01-01', rate: 0.18 },
]

export function israelVatRate(dateStr?: string | null): number {
  const date = parseInvoiceDate(dateStr)
  if (!date) return VAT_RATE_CURRENT
  for (const period of VAT_RATE_PERIODS) {
    if (date.getTime() >= new Date(period.from).getTime()) return period.rate
  }
  return VAT_RATE_CURRENT
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function arithmeticTolerance(total: number): number {
  // abs() so credit notes (negative totals) get the same relative tolerance.
  return Math.max(0.05, Math.abs(total) * 0.005)
}

function isBalanced(pretax: number, vat: number, total: number): boolean {
  return Math.abs(pretax + vat - total) <= arithmeticTolerance(total)
}

export function deriveVatFromTotal(input: VatDerivationInput): VatDerivationResult {
  const { pretax, vat, total } = input
  const passthrough: VatDerivationResult = { pretax, vat, vatDerived: false, rate: null }

  // Missing/zero total stays with the validator (needs_review). Negative
  // totals are credit notes — derived like any other, yielding negative VAT.
  if (total == null || !Number.isFinite(total) || total === 0) return passthrough

  const bothMissing = pretax == null && vat == null
  const mismatch = pretax != null && vat != null && !isBalanced(pretax, vat, total)
  if (!bothMissing && !mismatch) return passthrough

  const currency = (input.currency || 'ILS').toUpperCase()
  if (currency !== 'ILS') {
    // Foreign invoices carry no Israeli VAT.
    return { pretax: total, vat: 0, vatDerived: true, rate: 0 }
  }

  const rate = israelVatRate(input.date)
  const derivedPretax = round2(total / (1 + rate))
  // vat as the remainder so pretax + vat === total exactly.
  const derivedVat = round2(total - derivedPretax)
  return { pretax: derivedPretax, vat: derivedVat, vatDerived: true, rate }
}
