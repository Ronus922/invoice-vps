import { createClient } from '@supabase/supabase-js'
import { storagePathFromFileUrl } from '@/lib/file-url'

// Server-only storage helpers for the private 'invoice-files' bucket.
// Bucket objects are never publicly reachable; access goes through short-lived
// signed URLs generated with the service-role key (callers are auth+allowlist gated).
const BUCKET = 'invoice-files'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Signed URL for one of OUR bucket objects. Returns null for external/legacy
// (base44) URLs — used by the browser proxy, which must only sign our objects
// (never redirect to an arbitrary URL).
export async function signedUrlFor(fileUrl: string, ttlSeconds = 120): Promise<string | null> {
  const path = storagePathFromFileUrl(fileUrl)
  if (!path) return null
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, ttlSeconds)
  if (error || !data) return null
  return data.signedUrl
}

// Resolve a stored file_url to a directly-fetchable URL for SERVER-side fetching:
//  - our bucket object  -> short-lived signed URL
//  - external/legacy URL (base44) -> returned unchanged (still publicly hosted)
//  - unmappable         -> null
export async function resolveFileUrl(fileUrl: string, ttlSeconds = 120): Promise<string | null> {
  const path = storagePathFromFileUrl(fileUrl)
  if (!path) return fileUrl.startsWith('http') ? fileUrl : null
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, ttlSeconds)
  if (error || !data) return null
  return data.signedUrl
}
