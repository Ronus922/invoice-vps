export function normalizeVendorName(vendor: string): string {
  return vendor
    .trim()
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ')
}
