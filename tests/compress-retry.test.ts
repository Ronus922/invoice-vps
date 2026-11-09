import { describe, expect, it } from 'vitest'
import { RETRY, TransientAwareError, backoffMs, isTransientStatus, retryStats, withRetry } from '@/lib/compress/retry'
import { cacheHeaders, createReadStore, createWriteStore, seconds, storageFailure, type BucketLike } from '@/lib/compress/supabase-store'

// The gateway in front of Storage can drop a request for a few seconds. These tests pin down WHICH failures are
// retried, how often, how long it waits — and that a permanent failure (wrong key, missing object) fails at once.

const sleeps = () => {
  const waited: number[] = []
  return { waited, sleep: async (ms: number) => void waited.push(ms) }
}

describe('backoff — 5 tries, exponential, capped at 30 seconds', () => {
  it('waits 4s, 8s, 16s and then 30s (the doubled 32s is capped)', () => {
    expect(RETRY).toEqual({ attempts: 5, baseMs: 4000, maxMs: 30_000 })
    expect([1, 2, 3, 4].map((n) => backoffMs(n))).toEqual([4000, 8000, 16000, 30000])
    expect(backoffMs(10)).toBe(30_000)
  })
})

describe('withRetry', () => {
  it('a first-try success never sleeps', async () => {
    const s = sleeps()
    expect(await withRetry(async () => 'ok', { sleep: s.sleep })).toBe('ok')
    expect(s.waited).toEqual([])
  })
  it('recovers after two transient failures, waiting 4s then 8s', async () => {
    const s = sleeps()
    let calls = 0
    const before = retryStats.retried
    const out = await withRetry(async () => {
      if (++calls <= 2) throw new Error('fetch failed')
      return 'ok'
    }, { sleep: s.sleep })
    expect(out).toBe('ok')
    expect(calls).toBe(3)
    expect(s.waited).toEqual([4000, 8000])
    expect(retryStats.retried).toBe(before + 1) // one CALL needed a retry, however many tries it took
  })
  it('gives up after exactly 5 tries (4 waits) and throws the LAST error', async () => {
    const s = sleeps()
    let calls = 0
    const before = retryStats.gaveUp
    await expect(withRetry(async () => { throw new Error(`fetch failed #${++calls}`) }, { sleep: s.sleep })).rejects.toThrow('fetch failed #5')
    expect(calls).toBe(5)
    expect(s.waited).toEqual([4000, 8000, 16000, 30000])
    expect(retryStats.gaveUp).toBe(before + 1)
  })
  it('a failure marked permanent is thrown at once: one try, no waiting', async () => {
    const s = sleeps()
    let calls = 0
    await expect(withRetry(async () => { calls++; throw new TransientAwareError('forbidden', false) }, { sleep: s.sleep })).rejects.toThrow('forbidden')
    expect(calls).toBe(1)
    expect(s.waited).toEqual([])
  })
})

describe('which HTTP statuses are worth another try', () => {
  it('no status (the request never completed), 408, 425, 429 and every 5xx → retry', () => {
    for (const s of [undefined, null, '', 'fetch failed', 408, 425, 429, 500, 502, 503, 504, '503']) expect(isTransientStatus(s as number)).toBe(true)
  })
  it('400, 401, 403, 404, 413 → permanent', () => {
    for (const s of [400, 401, 403, 404, 413, '404']) expect(isTransientStatus(s)).toBe(false)
  })
  it('storageFailure carries the verdict on the error itself', () => {
    expect(storageFailure('download', { message: 'fetch failed' }).transient).toBe(true)
    expect(storageFailure('download', { message: 'Object not found', status: 404 }).transient).toBe(false)
    expect(storageFailure('upload', { message: 'bad gateway', status: 502 }).transient).toBe(true)
    expect(storageFailure('upload', null).message).toBe('storage_upload_failed: no data')
  })
})

type Err = { message: string; status?: number }
const entry = (name: string, size: number) => ({ name, id: name, metadata: { size, mimetype: 'image/jpeg', cacheControl: 'max-age=3600' } })

function fakeBucket(over: Partial<BucketLike> = {}): BucketLike {
  return {
    list: async () => ({ data: [], error: null }),
    download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }),
    upload: async () => ({ error: null }),
    remove: async () => ({ error: null }),
    ...over,
  }
}

describe('the Storage adapters retry through the gateway', () => {
  it('download: two "fetch failed" in a row, then the bytes', async () => {
    const s = sleeps()
    let calls = 0
    const store = createReadStore('u', 'k', {
      retry: { sleep: s.sleep },
      bucket: fakeBucket({ download: async () => (++calls <= 2 ? { data: null, error: { message: 'fetch failed' } as Err } : { data: new Blob([new Uint8Array([9, 8, 7])]), error: null }) }),
    })
    expect([...(await store.download('invoices/a.jpg'))]).toEqual([9, 8, 7])
    expect(calls).toBe(3)
    expect(s.waited).toEqual([4000, 8000])
  })
  it('download of a missing object (404) fails on the first try', async () => {
    const s = sleeps()
    let calls = 0
    const store = createReadStore('u', 'k', {
      retry: { sleep: s.sleep },
      bucket: fakeBucket({ download: async () => { calls++; return { data: null, error: { message: 'Object not found', status: 404 } as Err } } }),
    })
    await expect(store.download('invoices/gone.jpg')).rejects.toThrow('storage_download_failed: Object not found')
    expect(calls).toBe(1)
    expect(s.waited).toEqual([])
  })
  it('a body that dies halfway (arrayBuffer rejects) is retried like any other network failure', async () => {
    const s = sleeps()
    let calls = 0
    const store = createReadStore('u', 'k', {
      retry: { sleep: s.sleep },
      bucket: fakeBucket({
        download: async () => {
          const bad = { arrayBuffer: async () => { throw new TypeError('terminated') } } as unknown as Blob
          return ++calls === 1 ? { data: bad, error: null } : { data: new Blob([new Uint8Array([5])]), error: null }
        },
      }),
    })
    expect([...(await store.download('invoices/a.jpg'))]).toEqual([5])
    expect(calls).toBe(2)
  })
  it('list: a failed page is retried and listing continues with the next page', async () => {
    const s = sleeps()
    const pages: number[] = []
    let first = true
    const store = createReadStore('u', 'k', {
      retry: { sleep: s.sleep },
      bucket: fakeBucket({
        list: async (_prefix, o) => {
          pages.push(o.offset)
          if (first) { first = false; return { data: null, error: { message: 'fetch failed' } as Err } }
          return { data: [entry('a.jpg', 10), entry('b.jpg', 20)], error: null }
        },
      }),
    })
    const out = await store.list()
    expect(out.map((o) => [o.path, o.size])).toEqual([['a.jpg', 10], ['b.jpg', 20]])
    expect(pages).toEqual([0, 0]) // the same page asked twice, then done
  })
  it('upload: a 502 from the gateway is retried and the same bytes go up again; a 403 is not retried', async () => {
    const s = sleeps()
    const sent: number[] = []
    let calls = 0
    const writer = createWriteStore('u', 'k', {
      retry: { sleep: s.sleep },
      bucket: fakeBucket({ upload: async (_p, body) => { sent.push(body.length); return ++calls === 1 ? { error: { message: 'Bad Gateway', status: 502 } as Err } : { error: null } } }),
    })
    await writer.upload('invoices/a.jpg', Buffer.from('abc'), { contentType: 'image/jpeg', cacheControl: 'max-age=60' })
    expect(sent).toEqual([3, 3])
    expect(s.waited).toEqual([4000])

    let denied = 0
    const forbidden = createWriteStore('u', 'k', {
      retry: { sleep: s.sleep },
      bucket: fakeBucket({ upload: async () => { denied++; return { error: { message: 'new row violates row-level security policy', status: 403 } as Err } } }),
    })
    await expect(forbidden.upload('x', Buffer.from('a'), { contentType: 'image/jpeg', cacheControl: null })).rejects.toThrow('storage_upload_failed')
    expect(denied).toBe(1)
  })
})

describe('an upload keeps the object\'s own Cache-Control', () => {
  it('"no-cache" (64 objects in the bucket) is sent as "no-cache", not turned into max-age=3600', async () => {
    const seen: Array<Record<string, string> | undefined> = []
    const writer = createWriteStore('u', 'k', { retry: { sleep: async () => {} }, bucket: fakeBucket({ upload: async (_p, _b, o) => { seen.push(o.headers); return { error: null } } }) })
    await writer.upload('invoices/a.jpg', Buffer.from('x'), { contentType: 'image/jpeg', cacheControl: 'no-cache' })
    await writer.upload('invoices/b.jpg', Buffer.from('x'), { contentType: 'image/jpeg', cacheControl: 'max-age=3600' })
    await writer.upload('invoices/c.jpg', Buffer.from('x'), { contentType: 'image/jpeg', cacheControl: 'max-age=86400, public' })
    await writer.upload('invoices/d.jpg', Buffer.from('x'), { contentType: 'image/jpeg', cacheControl: null })
    expect(seen).toEqual([{ 'cache-control': 'no-cache' }, { 'cache-control': 'max-age=3600' }, { 'cache-control': 'max-age=86400, public' }, undefined])
  })
  it('the helpers: verbatim header when there is a value, none when there is not; seconds() is only the fallback number', () => {
    expect(cacheHeaders('no-cache')).toEqual({ 'cache-control': 'no-cache' })
    expect(cacheHeaders(null)).toBeUndefined()
    expect(cacheHeaders('')).toBeUndefined()
    expect(seconds('no-cache')).toBe('3600')
    expect(seconds('max-age=120')).toBe('120')
  })
})
