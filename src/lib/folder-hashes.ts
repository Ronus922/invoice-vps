// Folder-scan files that were recognised as duplicates but could NOT be confirmed (owner's decision, 2026-11-11).
//
// The folder scan deletes a duplicate's source file only after the server confirmed the row it duplicates and that row's
// file (Decision 2, 2026-11-10). A file that cannot be confirmed stays in the folder — and used to be uploaded, read by
// the model (billed) and judged a duplicate again on EVERY scan. Now its SHA-256 is remembered here, and the next scans
// skip it before the upload and before the extraction. The hash is of the file's bytes, so it can only ever match the same
// file: a different document never matches, whatever it is called.
//
// Additive table, written and read only by the authenticated /api/folder-hashes routes (service role).
import type { SupabaseClient } from '@supabase/supabase-js'

export const SHA256_HEX = /^[0-9a-f]{64}$/
const TABLE = 'folder_duplicate_hashes'

export interface KnownHash {
  sha256: string
  /** The row the file duplicates. The scan re-verifies it on every run: if it is gone or confirmable, the memory is stale. */
  existing_id: string | null
  reason: string
}

/** The remembered hashes among `hashes`. Throws on a database error: "could not look" must not read as "unknown file"
 *  — the caller falls back to the normal scan, which is what happened before this table existed. */
export async function findKnownHashes(db: Pick<SupabaseClient, 'from'>, hashes: string[]): Promise<KnownHash[]> {
  const valid = [...new Set(hashes.filter((h) => SHA256_HEX.test(h)))]
  if (valid.length === 0) return []
  const { data, error } = await db.from(TABLE).select('sha256, existing_id, reason').in('sha256', valid)
  if (error) throw new Error(`folder_hash_lookup_failed:${error.code ?? 'unknown'}`)
  return (data ?? []) as KnownHash[]
}

export interface UnverifiedHash {
  sha256: string
  /** The row the file duplicates — always named: a duplicate nobody could name is never remembered. */
  existing_id: string
  reason: string
  file_name: string | null
}

/** Remembers (or refreshes) a hash. Returns false when it could not be stored — the file is then simply scanned again. */
export async function recordUnverifiedHash(db: Pick<SupabaseClient, 'from'>, record: UnverifiedHash): Promise<boolean> {
  if (!SHA256_HEX.test(record.sha256)) return false
  const { error } = await db
    .from(TABLE)
    .upsert(
      { sha256: record.sha256, existing_id: record.existing_id, reason: record.reason, file_name: record.file_name, last_seen_at: new Date().toISOString() },
      { onConflict: 'sha256' },
    )
  return !error
}
