// Constant-time string equality, safe for both the edge runtime (middleware —
// no node:crypto.timingSafeEqual) and node. Compares the full length regardless
// of mismatch position; a length difference folds into the result.
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}
