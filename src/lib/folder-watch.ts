import { InvoiceEntity, type Invoice } from '@/lib/entities'
import { uploadFile } from '@/lib/upload'
import { applyRememberedCategory, rememberVendorCategory } from '@/lib/vendor-category-memory'
import { normalizeDocType } from '@/lib/doc-type'

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
  errors: number
  currentFile: string | null
}

export interface FolderScanResult {
  total: number
  created: number
  duplicates: number
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

export async function runFolderScan(
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
    errors: 0,
    currentFile: null,
  }
  const report = () => onProgress?.({ ...progress })
  report()

  const errorMessages: string[] = []

  for (const { name, fileHandle } of files) {
    progress.currentFile = name
    report()

    try {
      const file = await fileHandle.getFile()
      const fileUrl = await uploadFile(file)

      const res = await fetch('/api/extract-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: fileUrl }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        errorMessages.push(`${name}: ${errData.error || 'חילוץ נכשל'}`)
        progress.errors += 1
        continue
      }

      const extracted = applyRememberedCategory(await res.json())
      const docType = normalizeDocType(extracted.doc_type)
      const docNum = String(extracted.doc_number ?? '').trim()

      // Fast client-side pre-check on the full identity key (vendor, doc_number,
      // doc_type). The DB unique index is the real guarantee — this only avoids a
      // needless upload+insert round-trip when the snapshot already has the row.
      const isDuplicate =
        docNum !== '' &&
        existingInvoices.some(
          (inv) =>
            inv.doc_number === extracted.doc_number &&
            inv.vendor === extracted.vendor &&
            (inv.doc_type ?? 'unknown') === docType
        )
      if (isDuplicate) {
        progress.duplicates += 1
        // Treat duplicate as a successful processing — remove the source file.
        try {
          await dirHandle.removeEntry(name)
        } catch (err) {
          errorMessages.push(`${name}: לא ניתן למחוק מהתיקייה (${err instanceof Error ? err.message : 'unknown'})`)
        }
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
        // DB-level dedup caught a duplicate the snapshot missed (racy re-scan or
        // two parallel scans). No row created — count it as a duplicate.
        progress.duplicates += 1
      } else {
        if (extracted.vendor && extracted.category) {
          rememberVendorCategory(extracted.vendor, extracted.category)
        }

        const needsReview = Boolean(extracted.needs_review)
        if (!needsReview) {
          // Fire-and-forget: send to accountant only when arithmetic checks out.
          fetch('/api/send-to-accountant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_url: fileUrl,
              vendor: extracted.vendor || '',
              date: extracted.date || '',
            }),
          })
            .then((sendRes) => {
              if (!sendRes.ok) console.error('[folder-watch] accountant send failed:', sendRes.status)
            })
            .catch((sendErr) => console.error('[folder-watch] accountant send failed:', sendErr))
        }

        progress.created += 1
      }

      // File processed (created or duplicate) — remove it from the folder.
      try {
        await dirHandle.removeEntry(name)
      } catch (err) {
        errorMessages.push(`${name}: לא ניתן למחוק מהתיקייה (${err instanceof Error ? err.message : 'unknown'})`)
      }
    } catch (err) {
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
