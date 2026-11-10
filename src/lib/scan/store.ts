import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { storagePathFromFileUrl } from '@/lib/file-url'
import { findDuplicateDocument } from '@/lib/find-duplicate-document'
import type { DocType } from '@/lib/doc-type'
import { upgradeReceiptToTaxInvoice } from '@/lib/upgrade-receipt'
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

/** What identifies a document (src/lib/doc-identity.ts): the vendor's spelling and the doc type are not part of it.
 *  `date` is the form's YYYY-MM-DD (or the table's DD/MM/YYYY — both are read). */
export interface DuplicateKey {
  docNumber: string
  date: string | null
  total: number | null
  vendorTaxId: string | null
}

export type UpgradeResult = { ok: true; row: Record<string, unknown> } | { ok: false }

export interface ScanStore {
  /** The existing row that is the same document (normalised doc_number + date + total, + tax id when both have one), or null. */
  findDuplicate(key: DuplicateKey): Promise<DuplicateInfo | null>
  /** Stores the photo in the private bucket; returns the object path and the file_url every row of the table uses. */
  uploadPhoto(img: Pick<CompressedImage, 'bytes' | 'contentType' | 'ext'>): Promise<{ path: string; fileUrl: string }>
  removePhoto(path: string): Promise<boolean>
  insertInvoice(row: Record<string, unknown>): Promise<InsertResult>
  /** Decision 1 (src/lib/doc-upgrade.ts): the stored RECEIPT `existingId` takes this tax invoice's photo and type — no new
   *  row. `ok: false` = it was not upgraded (the row changed in the meantime); the caller removes the photo. */
  upgradeInvoice(existingId: string, input: { fileUrl: string; fileName: string; docType: DocType }): Promise<UpgradeResult>
}

/** The identity lookup (src/lib/find-duplicate-document.ts) for a scan: no document number or no total = no identity = null.
 *  A database error is thrown, never read as "no duplicate". */
export async function findDuplicateIn(db: Pick<SupabaseClient, 'from'>, key: DuplicateKey): Promise<DuplicateInfo | null> {
  const hit = await findDuplicateDocument(db, { doc_number: key.docNumber, date: key.date, total: key.total, vendor_tax_id: key.vendorTaxId })
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

    async upgradeInvoice(existingId, input) {
      const res = await upgradeReceiptToTaxInvoice(admin(), existingId, { file_url: input.fileUrl, file_name: input.fileName, doc_type: input.docType })
      if (!res.upgraded) return { ok: false }
      // The photo is the row's file from here on — if the read-back fails the answer is still "upgraded".
      const { data } = await admin().from('invoices').select('*').eq('id', existingId).single()
      return { ok: true, row: (data as Record<string, unknown> | null) ?? { id: existingId } }
    },

    async insertInvoice(row) {
      const { data, error } = await admin().from('invoices').insert(row).select().single()
      if (error) {
        // The partial unique index on (vendor, doc_number, doc_type) caught a same-document row
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
