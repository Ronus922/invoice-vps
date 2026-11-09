import { createClient } from '@supabase/supabase-js'
import { TransientAwareError, isTransientStatus, withRetry, type RetryPolicy } from './retry'
import type { ReadStore, StoredObject, WriteStore } from './run'

// The Storage adapters. They are separate on purpose: a dry run builds ONLY the read store, so there is no
// object in the process that could upload or remove anything — "a dry run writes nothing" is structural, not a
// promise. The read and write stores never call `remove`: compression replaces bytes in place. Deleting is a
// different tool (scripts/delete-orphans.ts) with its own RemoveStore, which only that script ever builds.
//
// Every call goes through withRetry (src/lib/compress/retry.ts): 5 tries, waits of 4s…30s. A failure that carries an
// HTTP status other than 408/425/429/5xx is permanent (wrong key, no such bucket) and is NOT retried.

const BUCKET = 'invoice-files'
const PAGE = 1000

/** The slice of a storage-js bucket client this file uses — so tests can hand in a fake. */
interface Failure {
  message: string
  status?: number | string
  statusCode?: number | string
}
interface ListEntry {
  name: string
  id: string | null
  created_at?: string | null
  metadata: Record<string, unknown> | null
}
export interface BucketLike {
  list(prefix: string, opts: { limit: number; offset: number; sortBy: { column: string; order: string } }): Promise<{ data: ListEntry[] | null; error: Failure | null }>
  download(path: string): Promise<{ data: Blob | null; error: Failure | null }>
  upload(path: string, body: Buffer, opts: { upsert: boolean; contentType: string; cacheControl: string }): Promise<{ error: Failure | null }>
  remove(paths: string[]): Promise<{ error: Failure | null }>
}

export interface StoreDeps {
  bucket?: BucketLike
  retry?: { policy?: RetryPolicy; sleep?: (ms: number) => Promise<void> }
}

function bucketOf(url: string, key: string): BucketLike {
  return createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET) as unknown as BucketLike
}

/** `cacheControl` comes back as "max-age=3600"; upload() wants the bare seconds. An unreadable value falls back to the
 *  bucket default instead of `undefined`, which storage-js would send as the literal header "max-age=undefined". */
export function seconds(cacheControl: string | null): string {
  return /max-age=(\d+)/.exec(cacheControl ?? '')?.[1] ?? '3600'
}

/** A failed storage call as an Error that knows whether another try can help. */
export function storageFailure(op: string, f: Failure | null): TransientAwareError {
  return new TransientAwareError(`storage_${op}_failed: ${f?.message ?? 'no data'}`, isTransientStatus(f?.status ?? f?.statusCode))
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function createReadStore(url: string, key: string, deps: StoreDeps = {}): ReadStore {
  const bucket = deps.bucket ?? bucketOf(url, key)
  const retried = <T>(fn: () => Promise<T>) => withRetry(fn, deps.retry)

  async function listPrefix(prefix: string, out: StoredObject[]): Promise<void> {
    for (let offset = 0; ; offset += PAGE) {
      const data = await retried(async () => {
        const res = await bucket.list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
        if (res.error || !res.data) throw storageFailure('list', res.error)
        return res.data
      })
      for (const e of data) {
        const full = prefix ? `${prefix}/${e.name}` : e.name
        if (e.id === null || !e.metadata) {
          await listPrefix(full, out) // a folder
        } else {
          const meta = e.metadata
          out.push({ path: full, size: int(meta.size), mime: str(meta.mimetype), cacheControl: str(meta.cacheControl), createdAt: str(e.created_at) })
        }
      }
      if (data.length < PAGE) break
    }
  }

  return {
    async list() {
      const out: StoredObject[] = []
      await listPrefix('', out)
      return out
    },
    download: (path) =>
      retried(async () => {
        const { data, error } = await bucket.download(path)
        if (error || !data) throw storageFailure('download', error)
        return Buffer.from(await data.arrayBuffer())
      }),
  }
}

/** Built by the --apply path only. An upload is an upsert of the same bytes to the same path, so a retry after an
 *  ambiguous failure (the request was applied but the answer was lost) is harmless; the read-back that follows every
 *  upload compares hashes either way. */
export function createWriteStore(url: string, key: string, deps: StoreDeps = {}): WriteStore {
  const bucket = deps.bucket ?? bucketOf(url, key)
  return {
    upload: (path, bytes, opts) =>
      withRetry(async () => {
        const { error } = await bucket.upload(path, bytes, { upsert: true, contentType: opts.contentType, cacheControl: seconds(opts.cacheControl) })
        if (error) throw storageFailure('upload', error)
      }, deps.retry),
  }
}

/** Built only by scripts/delete-orphans.ts. Removing a path that is already gone is a no-op, so a retry is harmless. */
export interface RemoveStore {
  remove(paths: string[]): Promise<void>
}

export function createRemoveStore(url: string, key: string, deps: StoreDeps = {}): RemoveStore {
  const bucket = deps.bucket ?? bucketOf(url, key)
  return {
    remove: (paths) =>
      withRetry(async () => {
        const { error } = await bucket.remove(paths)
        if (error) throw storageFailure('remove', error)
      }, deps.retry),
  }
}
