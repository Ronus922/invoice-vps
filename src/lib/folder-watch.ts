import { InvoiceEntity, type Invoice } from '@/lib/entities'
import { uploadFile, discardUploadedFile } from '@/lib/upload'
import { sha256Hex } from '@/lib/file-hash'
import { applyRememberedCategory, rememberVendorCategory } from '@/lib/vendor-category-memory'
import { normalizeDocType } from '@/lib/doc-type'
import { findDuplicateInList } from '@/lib/doc-identity'
import { duplicateAction } from '@/lib/doc-upgrade'

const IDB_NAME = 'invoiceflow-folder-watch'
const IDB_STORE = 'handles'
const IDB_VERSION = 1
const HANDLE_KEY = 'watchedFolder'

export type FileSystemPermissionMode = 'read' | 'readwrite'

export interface FolderScanProgress {
  total: number
  processed: number
  created: number
  duplicates: number
  /** Duplicates skipped by their remembered hash — before any upload or extraction (src/lib/folder-hashes.ts). Counted in `duplicates` too. */
  skippedKnown: number
  errors: number
  currentFile: string | null
}

export interface FolderScanResult {
  total: number
  created: number
  duplicates: number
  /** Of `duplicates`: files left in the folder because their original could not be confirmed, skipped by hash. */
  skippedKnown: number
  errors: number
  errorMessages: string[]
}

const SUPPORTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp']

export function isFolderWatchSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'showDirectoryPicker' in window
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openIdb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(handle, HANDLE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openIdb()
  const result = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(HANDLE_KEY)
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result
}

export async function clearFolderHandle(): Promise<void> {
  const db = await openIdb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).delete(HANDLE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: FileSystemPermissionMode = 'readwrite'
): Promise<boolean> {
  const opts = { mode }
  const current = await handle.queryPermission(opts)
  if (current === 'granted') return true
  const requested = await handle.requestPermission(opts)
  return requested === 'granted'
}

function isSupportedFile(name: string): boolean {
  const lower = name.toLowerCase()
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

async function listSupportedFiles(
  handle: FileSystemDirectoryHandle
): Promise<{ name: string; fileHandle: FileSystemFileHandle }[]> {
  const out: { name: string; fileHandle: FileSystemFileHandle }[] = []
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file') continue
    if (!isSupportedFile(entry.name)) continue
    out.push({ name: entry.name, fileHandle: entry })
  }
  return out
}

// NotFoundError = the file is already gone, which IS the goal state (a
// concurrent run or the user removed it). Treat as success — reporting it as
// a failure is what produced the false "לא ניתן למחוק מהתיקייה" errors.
async function removeSourceFile(
  dirHandle: FileSystemDirectoryHandle,
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await dirHandle.removeEntry(name)
    return { ok: true }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return { ok: true }
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

/** What the server says about the row a duplicate points at (GET /api/invoices/verify):
 *  'ok' — the row exists and its file is in Storage; 'not_found' — there is no such row (any more);
 *  'unconfirmed' — anything else (a missing or empty file, an external legacy URL, a failed request, no id). */
export type ExistingDocumentStatus = 'ok' | 'not_found' | 'unconfirmed'

export async function checkExistingDocument(existingId: string | undefined, fetchImpl: typeof fetch = fetch): Promise<ExistingDocumentStatus> {
  if (!existingId) return 'unconfirmed'
  try {
    const res = await fetchImpl(`/api/invoices/verify?id=${encodeURIComponent(existingId)}`, { credentials: 'include' })
    if (!res.ok) return 'unconfirmed'
    const body = (await res.json()) as { ok?: unknown; reason?: unknown }
    if (body.ok === true) return 'ok'
    return body.reason === 'not_found' ? 'not_found' : 'unconfirmed'
  } catch {
    return 'unconfirmed'
  }
}

/** Decision 2 (2026-11-10): a duplicate's source file leaves the folder only AFTER the row it duplicates — and that
 *  row's file in Storage — have been confirmed by the server (GET /api/invoices/verify). Anything that cannot be
 *  confirmed (no id, no such row, a missing or empty file, a failed request) keeps the file in the folder. */
export async function verifyExistingDocument(existingId: string | undefined, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  return (await checkExistingDocument(existingId, fetchImpl)) === 'ok'
}

/** What an earlier scan remembered about a file's bytes: it was recognised as a duplicate that could not be confirmed. */
export interface KnownDuplicateHash {
  existing_id: string | null
}

/** Is this file one an earlier scan recognised as an unconfirmable duplicate? null = unknown — and also when the lookup
 *  fails: the scan then proceeds exactly as it did before hashes were remembered. */
export async function lookupKnownHash(hash: string, fetchImpl: typeof fetch = fetch): Promise<KnownDuplicateHash | null> {
  try {
    const res = await fetchImpl('/api/folder-hashes/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: [hash] }),
      credentials: 'include',
    })
    if (!res.ok) return null
    const body = (await res.json()) as { known?: { sha256?: unknown; existing_id?: unknown }[] }
    const hit = (body.known ?? []).find((k) => k.sha256 === hash)
    return hit ? { existing_id: typeof hit.existing_id === 'string' ? hit.existing_id : null } : null
  } catch {
    return null
  }
}

/** Remember a duplicate that could not be confirmed, so the next scans skip it before the upload and the extraction. Never throws. */
export async function rememberUnverifiedDuplicate(
  record: { sha256: string; existing_id: string; file_name: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    await fetchImpl('/api/folder-hashes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...record, reason: 'unverified_duplicate' }),
      credentials: 'include',
    })
  } catch {
    /* the file is simply scanned again next time */
  }
}

async function removeConfirmedDuplicate(
  dirHandle: FileSystemDirectoryHandle,
  name: string,
  existingId: string | undefined,
  errorMessages: string[],
  progress: FolderScanProgress,
  hash: string | null,
): Promise<void> {
  if (!(await verifyExistingDocument(existingId))) {
    errorMessages.push(`${name}: הכפילות לא אומתה (השורה הקיימת או הקובץ שלה לא נמצאו) — הקובץ נשאר בתיקייה`)
    progress.errors += 1
    // Remember the file's bytes — but only when the row it duplicates is NAMED: the next scans skip it while that row still
    // exists and is still unconfirmable (src/lib/folder-hashes.ts). A duplicate the server could not name (a transient
    // answer: a lookup that failed, a lost race) is NOT remembered — its file may be the only copy of a real document, and
    // the next scan resolves it with a fresh extraction, exactly as before.
    if (hash && existingId) await rememberUnverifiedDuplicate({ sha256: hash, existing_id: existingId, file_name: name })
    return
  }
  const removed = await removeSourceFile(dirHandle, name)
  if (!removed.ok) {
    errorMessages.push(`${name}: לא ניתן למחוק מהתיקייה (${removed.error})`)
    progress.errors += 1
  }
}

// One scan at a time — across the scan panel, a double click, and other tabs.
// Overlapping scans used to double-process files and then fail deleting what
// the other run already deleted.
const SCAN_LOCK_NAME = 'invoiceflow-folder-scan'
let scanLockHeldFallback = false // same-tab guard when Web Locks is unavailable

// Returns null when another scan already holds the lock.
export async function runFolderScan(
  dirHandle: FileSystemDirectoryHandle,
  existingInvoices: Invoice[],
  onProgress?: (snap: FolderScanProgress) => void
): Promise<FolderScanResult | null> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return navigator.locks.request(SCAN_LOCK_NAME, { ifAvailable: true }, async (lock) =>
      lock ? runFolderScanLocked(dirHandle, existingInvoices, onProgress) : null
    )
  }
  if (scanLockHeldFallback) return null
  scanLockHeldFallback = true
  try {
    return await runFolderScanLocked(dirHandle, existingInvoices, onProgress)
  } finally {
    scanLockHeldFallback = false
  }
}

async function runFolderScanLocked(
  dirHandle: FileSystemDirectoryHandle,
  existingInvoices: Invoice[],
  onProgress?: (snap: FolderScanProgress) => void
): Promise<FolderScanResult> {
  const granted = await ensurePermission(dirHandle, 'readwrite')
  if (!granted) {
    throw new Error('הגישה לתיקייה לא אושרה')
  }

  const files = await listSupportedFiles(dirHandle)
  const progress: FolderScanProgress = {
    total: files.length,
    processed: 0,
    created: 0,
    duplicates: 0,
    skippedKnown: 0,
    errors: 0,
    currentFile: null,
  }
  const report = () => onProgress?.({ ...progress })
  report()

  const errorMessages: string[] = []

  for (const { name, fileHandle } of files) {
    progress.currentFile = name
    report()

    // The file is stored BEFORE the document is read: every exit that ends without a row removes it again (owner's
    // decision of 2026-11-11). `rowKept` = a row (or an upgraded row) now points at it.
    let uploadedUrl: string | null = null
    let rowKept = false
    try {
      let file: File
      try {
        file = await fileHandle.getFile()
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotFoundError') {
          // File vanished after listing (consumed elsewhere) — nothing to do.
          progress.duplicates += 1
          continue
        }
        throw err
      }

      // A file an earlier scan recognised as a duplicate it could not confirm is skipped here — before the upload and
      // before the (billed) extraction — but ONLY while that is still true: the row it duplicates must still exist and
      // still be unconfirmable. If the row is gone, or its file is confirmable now, the memory is stale and the file is
      // scanned normally (a fresh extraction and identity match decide, and only then may the source file be deleted —
      // a remembered file is never deleted on the strength of an old match).
      const hash = await sha256Hex(file).catch(() => null)
      const known = hash ? await lookupKnownHash(hash) : null
      if (known && known.existing_id && (await checkExistingDocument(known.existing_id)) === 'unconfirmed') {
        progress.duplicates += 1
        progress.skippedKnown += 1
        continue
      }

      const fileUrl = await uploadFile(file)
      uploadedUrl = fileUrl

      const res = await fetch('/api/extract-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: fileUrl }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        errorMessages.push(`${name}: ${errData.error || 'חילוץ נכשל'}`)
        progress.errors += 1
        await discardUploadedFile(fileUrl)
        continue
      }

      const extracted = applyRememberedCategory(await res.json())
      const docType = normalizeDocType(extracted.doc_type)

      // Fast client-side pre-check on the document's identity (src/lib/doc-identity.ts: normalised doc_number +
      // date + total, + tax id when both sides have one — not the vendor's spelling, not the doc type). The server
      // (POST /api/invoices) checks again and is the real guard — this only avoids a needless round-trip.
      // Decision 1: a tax invoice over a stored RECEIPT is not skipped — the server upgrades that row.
      const match = findDuplicateInList(existingInvoices, extracted)
      if (match && duplicateAction(match.doc_type, docType) === 'skip') {
        progress.duplicates += 1
        // The uploaded copy has no row and will get none: remove it again.
        await discardUploadedFile(fileUrl)
        // Treat duplicate as a successful processing — remove the source file, once the existing row is confirmed.
        await removeConfirmedDuplicate(dirHandle, name, match.id, errorMessages, progress, hash)
        continue
      }

      const created = await InvoiceEntity.create({
        ...extracted,
        doc_type: docType,
        file_url: fileUrl,
        file_name: name,
        source: 'folder',
      })

      if (created && 'duplicate' in created) {
        // The server's dedup caught a duplicate the snapshot missed (racy re-scan or two parallel scans), or
        // upgraded a stored receipt to this tax invoice. No row created — count it as a duplicate; the source file
        // goes only once the server's row (named in the answer) is confirmed. (The server removed the uploaded copy
        // itself when it was a plain duplicate; an upgrade keeps it — it is the row's file now.)
        progress.duplicates += 1
        if (created.upgraded) rowKept = true
        await removeConfirmedDuplicate(dirHandle, name, created.existing_id, errorMessages, progress, hash)
      } else {
        rowKept = true
        if (extracted.vendor && extracted.category) {
          rememberVendorCategory(extracted.vendor, extracted.category)
        }

        // Server-computed flag (may differ from `extracted` — e.g. a non-invoice
        // doc_type forces review on insert).
        const needsReview = Boolean(created.needs_review)
        if (!needsReview) {
          // Awaited: the fire-and-forget version resolved after the UI refresh,
          // leaving sent rows painted as unsent until a manual click.
          try {
            const sendRes = await fetch('/api/send-to-accountant', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                invoice_id: created.id,
                file_url: fileUrl,
                vendor: extracted.vendor || '',
                date: extracted.date || '',
              }),
            })
            const sendData = await sendRes.json().catch(() => null)
            if (!sendRes.ok || sendData?.sent !== true) {
              console.error(
                '[folder-watch] accountant send not sent:',
                sendData?.reason || sendData?.error || sendRes.status
              )
            }
          } catch (sendErr) {
            console.error('[folder-watch] accountant send failed:', sendErr)
          }
        }

        progress.created += 1

        // File processed (created) — remove it from the folder.
        const removed = await removeSourceFile(dirHandle, name)
        if (!removed.ok) {
          errorMessages.push(`${name}: לא ניתן למחוק מהתיקייה (${removed.error})`)
          progress.errors += 1
        }
      }
    } catch (err) {
      // No row: remove the uploaded copy. A failed save whose answer was lost may still have committed — the server
      // never removes an object a row points at, so that case keeps its file.
      if (uploadedUrl && !rowKept) await discardUploadedFile(uploadedUrl)
      const message = err instanceof Error ? err.message : 'שגיאה לא ידועה'
      errorMessages.push(`${name}: ${message}`)
      progress.errors += 1
    } finally {
      progress.processed += 1
      report()
    }
  }

  progress.currentFile = null
  report()

  const result: FolderScanResult = {
    total: progress.total,
    created: progress.created,
    duplicates: progress.duplicates,
    skippedKnown: progress.skippedKnown,
    errors: progress.errors,
    errorMessages,
  }

  // Persist scan state on the server so StatsCards can show it.
  try {
    await fetch('/api/folder-watch/scan-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scannedAt: new Date().toISOString(),
        count: result.created,
        error: result.errors > 0 ? errorMessages[0] ?? null : null,
      }),
    })
  } catch {
    /* non-critical */
  }

  return result
}
