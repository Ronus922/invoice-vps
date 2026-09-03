export interface InvoiceAmounts {
  pretax?: number | null
  vat?: number | null
  total?: number | null
}

export interface ValidationResult {
  ok: boolean
  reason: string | null
  needsReview: boolean
}

const OK: ValidationResult = { ok: true, reason: null, needsReview: false }

export function validateInvoiceArithmetic(inv: InvoiceAmounts): ValidationResult {
  const total = inv.total
  if (total == null) {
    return { ok: false, reason: 'סה״כ חסר — לא חולץ מהחשבונית', needsReview: true }
  }
  // Negative totals are legitimate — credit notes (חשבוניות זיכוי) reduce the
  // amount owed. Only zero is invalid: it means extraction failed (POST coerces
  // a missing total to 0 so the file is still saved, flagged here).
  if (!Number.isFinite(total) || total === 0) {
    return { ok: false, reason: `סה״כ לא תקין (${total})`, needsReview: true }
  }

  const pretax = inv.pretax
  const vat = inv.vat

  if (pretax != null && vat != null) {
    const sum = pretax + vat
    const diff = Math.abs(sum - total)
    const tolerance = Math.max(0.05, Math.abs(total) * 0.005)
    if (diff > tolerance) {
      return {
        ok: false,
        reason: `אי-התאמה חשבונית: לפני מע״מ (${pretax}) + מע״מ (${vat}) = ${sum.toFixed(2)} ≠ סה״כ (${total})`,
        needsReview: true,
      }
    }
  }

  return OK
}
