import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizeDocType } from '@/lib/doc-type'
import { normalizeVendorName } from '@/lib/vendor-utils'
import { storagePathFromFileUrl } from '@/lib/file-url'
import type { CompressedImage } from './image'
import type { DuplicateInfo } from './model'

// The scan's only doors to Supabase: the SAME `invoices` table and the SAME private `invoice-files`
// bucket as every other document. Service-role (RLS is bypassed), so each caller — a route — has
// already been through getAuthenticatedUser(). Kept behind the ScanStore interface so the save logic
// (save.ts) is tested without a database.

const BUCKET = 'invoice-files'

let client: SupabaseClient | null = null
/** Lazy: importing this module (a unit test, a build step) must not need the service-role env. */
function admin(): SupabaseClient {
  if (!client) client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return client
}

export type InsertResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; duplicate: true }
  | { ok: false; duplicate: false; message: string }

export interface ScanStore {
  /** The existing document with this identity (vendor, doc_number, doc_type), or null. */
  findDuplicate(key: { vendor: string; docNumber: string; docType: string }): Promise<DuplicateInfo | null>
  /** Stores the photo in the private bucket; returns the object path and the file_url every row of the table uses. */
  uploadPhoto(img: Pick<CompressedImage, 'bytes' | 'contentType' | 'ext'>): Promise<{ path: string; fileUrl: string }>
  removePhoto(path: string): Promise<boolean>
  insertInvoice(row: Record<string, unknown>): Promise<InsertResult>
}

const DUP_COLUMNS = 'id, vendor, doc_number, doc_type, date, total, currency, source, created_at'

/** Identity key used everywhere in this app: (vendor, doc_number, doc_type). The DB's unique index compares the
 *  strings exactly; this check also treats vendor spellings that differ only by case, quotes or spacing as the same
 *  vendor (normalizeVendorName) — the OCR re-spells the same company often enough to have duplicated rows before. */
export async function findDuplicateIn(
  db: SupabaseClient,
  key: { vendor: string; docNumber: string; docType: string },
): Promise<DuplicateInfo | null> {
  const docNumber = key.docNumber.trim()
  if (docNumber === '') return null // the unique index ignores rows without a number, so there is no identity to compare
  const docType = normalizeDocType(key.docType)
  // 1000 = PostgREST's own row ceiling: the lookup must see EVERY row that shares the number and type, or a match
  // beyond an arbitrary first page would let a duplicate through (legacy rows are not covered by the unique index).
  const { data, error } = await db.from('invoices').select(DUP_COLUMNS).eq('doc_number', docNumber).eq('doc_type', docType).limit(1000)
  if (error) throw new Error(`duplicate_lookup_failed:${error.code ?? 'unknown'}`)
  const wanted = normalizeVendorName(key.vendor)
  const hit = (data ?? []).find((r) => normalizeVendorName(String(r.vendor ?? '')) === wanted)
  return hit ? (hit as unknown as DuplicateInfo) : null
}

export function supabaseScanStore(): ScanStore {
  return {
    findDuplicate: (key) => findDuplicateIn(admin(), key),

    async uploadPhoto(img) {
      const path = `invoices/${crypto.randomUUID()}.${img.ext}`
      const { error } = await admin().storage.from(BUCKET).upload(path, img.bytes, { contentType: img.contentType })
      if (error) throw new Error('photo_upload_failed')
      // Same shape as every stored file_url; the bucket is private, so this URL opens nothing by itself —
      // files are served through the authenticated routes (/api/file, /api/scan/[id]/image).
      const { data } = admin().storage.from(BUCKET).getPublicUrl(path)
      return { path, fileUrl: data.publicUrl }
    },

    async removePhoto(path) {
      const { error } = await admin().storage.from(BUCKET).remove([path])
      if (error) {
        // The key is a bare UUID path: safe to log, and the only trace of an object nothing points at.
        console.error('[scan] orphan photo could not be removed', { path })
        return false
      }
      return true
    },

    async insertInvoice(row) {
      const { data, error } = await admin().from('invoices').insert(row).select().single()
      if (error) {
        // The partial unique index on (vendor, doc_number, doc_type) caught a same-identity row
        // (a race the pre-check could not see). Reported, never swallowed.
        if (error.code === '23505') return { ok: false, duplicate: true }
        console.error('[scan] insert failed', { code: error.code })
        return { ok: false, duplicate: false, message: error.message }
      }
      return { ok: true, row: data as Record<string, unknown> }
    },
  }
}

/** The only object path a scan ever stores: invoices/<uuid>.jpg (see uploadPhoto). */
const SCAN_OBJECT_PATH = /^invoices\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/

export function isScanObjectPath(path: string | null): path is string {
  return path !== null && SCAN_OBJECT_PATH.test(path)
}

/** The stored photo of a scanned row, for the authenticated image route. null when the object is gone — or when
 *  the row's file_url does not point at an object of the exact shape a scan stores. `source` is a column the one
 *  authenticated user can also write through POST/PATCH /api/invoices, so the path SHAPE (no `..`, no other
 *  folder, no other bucket) is what keeps this route from reading anything else; the source filter alone does not. */
export async function downloadScanPhoto(fileUrl: string): Promise<Buffer | null> {
  const path = storagePathFromFileUrl(fileUrl)
  if (!isScanObjectPath(path)) return null
  const { data, error } = await admin().storage.from(BUCKET).download(path)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

/** A scanned row (source = 'scan') by id — the only rows the image route serves. */
export async function getScanRow(id: string): Promise<{
  id: string; vendor: string | null; doc_number: string | null; date: string | null; file_url: string | null
} | null> {
  const { data } = await admin()
    .from('invoices')
    .select('id, vendor, doc_number, date, file_url')
    .eq('id', id)
    .eq('source', 'scan')
    .not('scanned_by', 'is', null) // only a scan sets this: POST/PATCH /api/invoices strip it (not in their schema)
    .maybeSingle()
  return (data as { id: string; vendor: string | null; doc_number: string | null; date: string | null; file_url: string | null } | null) ?? null
}
