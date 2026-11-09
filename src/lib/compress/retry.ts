// Retry for the calls that go through the shared Supabase gateway (kong). That gateway can drop a request for a few
// seconds (a worker killed, a container recreated), and a one-off "fetch failed" must not become a skipped file or —
// in --apply — a spurious rollback. Every Storage call this feature makes is idempotent (list/download read; upload
// is an upsert of the same bytes to the same path; remove of a missing object is a no-op), so all of them may be retried.

export interface RetryPolicy {
  /** Total tries, the first one included. */
  attempts: number
  /** The wait after the first failure; it doubles after every further failure. */
  baseMs: number
  /** No single wait is longer than this. */
  maxMs: number
}

/** 5 tries; waits of 4s, 8s, 16s, 30s (the doubled 32s is capped) — about a minute in all, enough to outlast a gateway restart. */
export const RETRY: RetryPolicy = { attempts: 5, baseMs: 4000, maxMs: 30_000 }

/** The wait after the Nth failed try (1-based). */
export const backoffMs = (failedTry: number, p: RetryPolicy = RETRY): number => Math.min(p.maxMs, p.baseMs * 2 ** (failedTry - 1))

/** Totals for the end-of-run line: how many calls needed a retry, and how many gave up anyway. */
export const retryStats = { retried: 0, gaveUp: 0 }

/** An error that says outright whether another try can help. */
export class TransientAwareError extends Error {
  constructor(message: string, readonly transient: boolean) {
    super(message)
    this.name = 'TransientAwareError'
  }
}

/** Retry unless the error is explicitly marked permanent (a 4xx other than 408/425/429: wrong key, no such bucket). */
export const defaultRetryable = (err: unknown): boolean => !(err instanceof TransientAwareError) || err.transient

/** HTTP status → worth retrying? No status at all means the request never completed ("fetch failed", reset): retry. */
export function isTransientStatus(status: number | string | null | undefined): boolean {
  const s = Number(status)
  if (!Number.isFinite(s) || s <= 0) return true
  return s === 408 || s === 425 || s === 429 || s >= 500
}

export interface RetryDeps {
  policy?: RetryPolicy
  retryable?: (err: unknown) => boolean
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function withRetry<T>(fn: () => Promise<T>, deps: RetryDeps = {}): Promise<T> {
  const policy = deps.policy ?? RETRY
  const retryable = deps.retryable ?? defaultRetryable
  const sleep = deps.sleep ?? realSleep
  let retried = false
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= policy.attempts || !retryable(err)) {
        if (attempt >= policy.attempts && retryable(err)) retryStats.gaveUp++
        throw err
      }
      if (!retried) {
        retried = true
        retryStats.retried++
      }
      await sleep(backoffMs(attempt, policy))
    }
  }
}
