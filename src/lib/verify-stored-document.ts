// "Is that document really stored?" — the check the folder scan makes BEFORE it deletes a source file as a duplicate
// (Decision 2, 2026-11-10). A file is removed from the user's folder only after this has confirmed that the row it
// duplicates exists AND that row's file is in the bucket (present and not empty). Anything it cannot confirm — no
// such row, a row without a file, a legacy external URL, a missing object, a lookup that failed — keeps the source file.
import type { SupabaseClient } from '@supabase/supabase-js'
import { storagePathFromFileUrl } from './file-url'

const BUCKET = 'invoice-files'

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'no_file' | 'external_file' | 'file_missing' | 'lookup_failed' }

export async function verifyStoredDocument(db: Pick<SupabaseClient, 'from' | 'storage'>, invoiceId: string): Promise<VerifyResult> {
  const { data, error } = await db.from('invoices').select('id, file_url').eq('id', invoiceId).maybeSingle()
  if (error) return { ok: false, reason: 'lookup_failed' }
  const row = data as { id: string; file_url: string | null } | null
  if (!row) return { ok: false, reason: 'not_found' }
  if (!row.file_url) return { ok: false, reason: 'no_file' }

  // Rows imported from the old system point at an external URL: their file is not in our bucket, so it cannot be confirmed here.
  const path = storagePathFromFileUrl(row.file_url)
  if (!path) return { ok: false, reason: 'external_file' }

  const slash = path.lastIndexOf('/')
  const folder = slash === -1 ? '' : path.slice(0, slash)
  const name = slash === -1 ? path : path.slice(slash + 1)
  const { data: listed, error: listError } = await db.storage.from(BUCKET).list(folder, { search: name, limit: 100 })
  if (listError) return { ok: false, reason: 'lookup_failed' }
  const object = (listed ?? []).find((o) => o.name === name)
  const size = Number((object?.metadata as { size?: unknown } | null | undefined)?.size ?? 0)
  return object && size > 0 ? { ok: true } : { ok: false, reason: 'file_missing' }
}
