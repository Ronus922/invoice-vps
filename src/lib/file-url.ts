// Pure, client-safe helpers for invoice file URLs (no secrets, no service client).
// Two kinds of stored file_url exist:
//  - our private Supabase bucket: .../object/public/invoice-files/<path>  (242 rows)
//  - legacy external URLs (base44 import): https://base44.app/...          (64 rows)
const BUCKET = 'invoice-files'

// Returns the object path inside our bucket, or null for external/non-bucket URLs.
export function storagePathFromFileUrl(fileUrl: string): string | null {
  if (!fileUrl) return null
  const marker = `/${BUCKET}/`
  const i = fileUrl.indexOf(marker)
  if (i !== -1) return fileUrl.slice(i + marker.length)
  if (fileUrl.startsWith('http')) return null // external (e.g. base44) — not our bucket
  return fileUrl.replace(/^\/+/, '') // bare path
}

// Browser href for opening a file: our bucket objects go through the authenticated
// proxy (which signs them); external/legacy URLs are opened directly.
export function fileHref(fileUrl: string): string {
  return storagePathFromFileUrl(fileUrl)
    ? `/api/file?u=${encodeURIComponent(fileUrl)}`
    : fileUrl
}
