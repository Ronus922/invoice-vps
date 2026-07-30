// Shared retry-with-backoff for external HTTP calls (Gmail API). Retries
// transient failures — 429 + 5xx and network/timeout errors — with exponential
// backoff + jitter, honoring Retry-After when present. Non-retryable statuses
// return immediately for the caller to handle.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  opts: { retries?: number; baseDelayMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 20000, ...rest } = init
  const retries = opts.retries ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 500

  let lastError: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const backoff = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs
    try {
      const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === retries) return res
      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff)
    } catch (err) {
      lastError = err
      if (attempt === retries) throw err
      await sleep(backoff)
    }
  }
  // Unreachable — the loop always returns or throws on the last attempt.
  throw lastError instanceof Error ? lastError : new Error('fetchWithRetry exhausted')
}
