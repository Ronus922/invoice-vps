const STORAGE_KEY = 'vendor-category-memory'

type VendorMap = Record<string, string>

function load(): VendorMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as VendorMap) : {}
  } catch {
    return {}
  }
}

function save(map: VendorMap): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private-mode errors
  }
}

function normalize(vendor: string): string {
  return vendor.trim().toLowerCase()
}

export function rememberVendorCategory(vendor: string, category: string): void {
  const v = normalize(vendor)
  const c = category.trim()
  if (!v || !c) return
  const map = load()
  map[v] = c
  save(map)
}

export function getRememberedCategory(vendor: string): string | null {
  const v = normalize(vendor)
  if (!v) return null
  return load()[v] ?? null
}

export function applyRememberedCategory<T extends { vendor?: string | null; category?: string | null }>(
  extracted: T
): T {
  if (!extracted || extracted.category) return extracted
  const vendor = extracted.vendor
  if (!vendor) return extracted
  const remembered = getRememberedCategory(vendor)
  if (!remembered) return extracted
  return { ...extracted, category: remembered }
}
