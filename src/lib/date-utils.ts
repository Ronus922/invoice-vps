export function parseInvoiceDate(str: string | null | undefined): Date | null {
  if (!str) return null
  if (str.includes('/')) {
    const [d, m, y] = str.split('/')
    const date = new Date(`${y}-${m}-${d}`)
    return isNaN(date.getTime()) ? null : date
  }
  const date = new Date(str)
  return isNaN(date.getTime()) ? null : date
}
