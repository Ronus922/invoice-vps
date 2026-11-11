// A file that reached Storage and got no row must not stay there (owner's decision, 2026-11-11).
//
// Every intake road uploads FIRST and decides afterwards (extraction needs the stored file), so a duplicate, a failed
// extraction, a rejection or a failed insert used to leave an object nothing points at — the 642 orphans of the
// 2026-11-10 cleanup. This is the one place that removes such an object, for the roads that cannot do it inline
// (POST /api/invoices, and the browser through POST /api/upload/discard):
//
//   - only an object of the exact shape /api/upload and the phone scan store — `invoices/<uuid>.<ext>` — is ever
//     touched: a caller cannot name another folder, another bucket or a path with `..`;
//   - only a FRESH upload (created within MAX_AGE_MS): an object that has existed for longer — for instance the old file
//     of a receipt that was upgraded, which is kept on purpose until scripts/delete-orphans.ts removes it with a backup —
//     is not this function's to delete. An age that cannot be read keeps the object;
//   - an object that ANY invoices row points at is never removed — a client that sends the file_url of an existing
//     document gets "referenced", not a deleted document. This is also what makes the "unknown outcome" exits safe: an
//     upgrade whose database answer was lost may have committed, and then a row references the file;
//   - nothing throws: the caller is already on a failure path and must still answer.
import type { SupabaseClient } from '@supabase/supabase-js'
import { storagePathFromFileUrl } from './file-url'

const BUCKET = 'invoice-files'
const UPLOADED_OBJECT = /^invoices\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp|gif|heic|heif)$/

/** A fresh upload is discarded within seconds (the same request, or the browser's next call): a day-old object is not one. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000

export type DiscardResult = 'removed' | 'not_found' | 'not_an_upload' | 'too_old' | 'referenced' | 'error'

/** The bucket path of a freshly uploaded object, or null when `fileUrl` is anything else. */
export function uploadedObjectPath(fileUrl: unknown): string | null {
  if (typeof fileUrl !== 'string' || !fileUrl) return null
  const path = storagePathFromFileUrl(fileUrl)
  return path !== null && UPLOADED_OBJECT.test(path) ? path : null
}

export async function discardUnreferencedUpload(db: Pick<SupabaseClient, 'from' | 'storage'>, fileUrl: unknown): Promise<DiscardResult> {
  const path = uploadedObjectPath(fileUrl)
  if (!path) return 'not_an_upload'
  try {
    // 1. Is it a FRESH upload? (Also answers "is it there at all": a second call for the same object finds nothing.)
    const slash = path.lastIndexOf('/')
    const { data: listed, error: listError } = await db.storage.from(BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 100 })
    if (listError) {
      console.error('[discard-upload] could not read the object — it is kept:', path)
      return 'error'
    }
    const object = (listed ?? []).find((o) => o.name === path.slice(slash + 1))
    if (!object) return 'not_found'
    const createdAt = Date.parse(String((object as { created_at?: unknown }).created_at ?? ''))
    if (!Number.isFinite(createdAt)) {
      console.error('[discard-upload] the object has no readable creation time — it is kept:', path)
      return 'error'
    }
    if (Date.now() - createdAt > MAX_AGE_MS) return 'too_old'

    // 2. Does a row point at it? The path holds only hex digits, hyphens and one dot, so it is safe inside a LIKE pattern.
    const { data, error } = await db.from('invoices').select('id').like('file_url', `%${path}`).limit(1)
    if (error) {
      console.error('[discard-upload] could not check whether a row points at the object — it is kept:', path)
      return 'error'
    }
    if ((data ?? []).length > 0) return 'referenced'
    const { error: removeError } = await db.storage.from(BUCKET).remove([path])
    if (removeError) {
      console.error('[discard-upload] storage cleanup failed (the object stays an orphan for scripts/delete-orphans.ts):', path)
      return 'error'
    }
    return 'removed'
  } catch (err) {
    console.error('[discard-upload] unexpected failure:', path, err instanceof Error ? err.message : err)
    return 'error'
  }
}
