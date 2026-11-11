// SHA-256 of a file's bytes, as 64 lowercase hex characters. Runs in the browser (the folder scan hashes each file
// BEFORE uploading it) and in tests (Node's webcrypto). The same bytes always give the same answer, whatever the file is called.
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
