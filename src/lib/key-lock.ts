// Runs async jobs that share a key one after another, inside this process. Two jobs with different keys (or with
// no key) run side by side as before.
//
// Why: the Gmail scan handles five attachments at once. "Is this document already stored?" followed by "store it"
// is two steps; two copies of one document in the same batch (a vendor re-sending, one mail with a document twice)
// both passed the first step before either finished the second. The unique index on (vendor, doc_number, doc_type)
// only catches that when the OCR spelled the vendor and the type identically, which is exactly what the document
// identity (src/lib/doc-identity.ts) exists to cover. Serialising by the identity key closes the window for a
// single process (the app is one long-lived process; overlapping scans are already refused).
const tails = new Map<string, Promise<unknown>>()

export async function withKeyLock<T>(key: string | null, job: () => Promise<T>): Promise<T> {
  if (key === null) return job()
  const previous = tails.get(key) ?? Promise.resolve()
  // Starts when the previous job of this key has finished, however it ended.
  const run = previous.then(job, job)
  const tail = run.then(() => undefined, () => undefined)
  tails.set(key, tail)
  try {
    return await run
  } finally {
    if (tails.get(key) === tail) tails.delete(key)
  }
}
