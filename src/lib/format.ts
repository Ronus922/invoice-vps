const CURRENCY_SYMBOLS: Record<string, string> = {
  ILS: '₪',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
}

export function currencySymbol(currency: string | null | undefined): string {
  const code = (currency || 'ILS').toUpperCase()
  return CURRENCY_SYMBOLS[code] || `${code} `
}

export function normalizeCurrency(input: unknown): string {
  if (typeof input !== 'string') return 'ILS'
  const code = input.trim().toUpperCase()
  if (!code) return 'ILS'
  if (code === 'NIS' || code === '₪' || code === 'SHEKEL') return 'ILS'
  if (code === '$' || code === 'USD$') return 'USD'
  if (code === '€') return 'EUR'
  if (code === '£') return 'GBP'
  if (/^[A-Z]{3}$/.test(code)) return code
  return 'ILS'
}

export function formatCurrency(
  val: number | null | undefined,
  currency: string | null | undefined = 'ILS'
): string {
  if (val == null) return '—'
  const n = Number(val)
  // Credit notes are negative — keep the minus in front of the symbol (‎-₪143.27)
  // instead of the awkward ₪-143.27.
  const sign = n < 0 ? '-' : ''
  return `${sign}${currencySymbol(currency)}${Math.abs(n).toLocaleString('he-IL', { minimumFractionDigits: 2 })}`
}
