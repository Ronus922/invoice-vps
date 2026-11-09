// The file name of a scanned receipt: {vendor}_{doc_number}_{YYYY-MM-DD}.jpg. It is the name the
// accountant's e-mail attachment carries (invoices.file_name) and the name the "הורד" button saves.
// The parts are typed or read from a receipt, so they can hold anything: this turns them into a name
// that is legal on Windows, macOS, Android and iOS and safe in a Content-Disposition header.
// Pure on purpose (no DB, no Next): the route feeds it the row, the tests feed it the worst names we can think of.

/** What no operating system allows in a file name. */
const ILLEGAL = /[\\/:*?"<>|]/g
/** Control characters and the invisible bidi / zero-width marks a pasted Hebrew-English name drags along. */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g

/** At most this many characters (code points) of each part: far above any real vendor, and two of them in
 *  Hebrew (2 bytes) or CJK (3 bytes) plus the date still fit the 255 bytes of a file name on APFS / ext4. */
const MAX_PART = 32

/** One part made safe: whitespace runs become one space, invisible characters go, illegal ones become
 *  `_`, and a leading / trailing dot or space (hidden file; Windows strips them) is trimmed. */
export function cleanNamePart(raw: string | null | undefined): string {
  const cleaned = (raw ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(INVISIBLE, '')
    .replace(ILLEGAL, '_')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '')
  // By code point, never in the middle of a surrogate pair (a lone surrogate makes encodeURIComponent throw).
  return Array.from(cleaned).slice(0, MAX_PART).join('').replace(/[. ]+$/g, '')
}

export interface ReceiptNameInput {
  vendor: string | null | undefined
  docNumber: string | null | undefined
  /** `YYYY-MM-DD` — the document's date. Anything else is left out of the name. */
  docDate: string | null | undefined
}

export function receiptFileName({ vendor, docNumber, docDate }: ReceiptNameInput): string {
  const date = docDate && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : ''
  const parts = [cleanNamePart(vendor), cleanNamePart(docNumber), date].filter((p) => p !== '')
  return `${parts.length > 0 ? parts.join('_') : 'receipt'}.jpg`
}

/** The name kept in `invoices.file_name` — the e-mail attachment, the Drive backup and the ZIP export all key on it.
 *  The download button saves the plain {vendor}_{doc_number}_{doc_date}.jpg (receiptFileName), but a receipt and a
 *  tax invoice of the same vendor can carry the same number and date (two legitimate identities), and the Drive
 *  backup adopts an existing file of the same name while the ZIP export overwrites it. So the stored name adds the
 *  document type, exactly like the exporters' own fallback name does (`_${doc_type}` unless 'unknown'). */
export function receiptStoredName({ docType, ...rest }: ReceiptNameInput & { docType: string | null | undefined }): string {
  const base = receiptFileName(rest).replace(/\.jpg$/, '')
  const type = docType && docType !== 'unknown' && /^[a-z_]{1,20}$/.test(docType) ? `_${docType}` : ''
  return `${base}${type}.jpg`
}

/** RFC 5987 `attr-char`: everything encodeURIComponent leaves alone EXCEPT `' ( ) *`, which it does not
 *  escape but which are not legal in `filename*=` (an unescaped `'` also reads as the charset delimiter). */
export function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** A `Content-Disposition` header for `name`: an ASCII `filename=` for old clients and the UTF-8 `filename*=`
 *  (RFC 5987) that carries the Hebrew. */
export function contentDisposition(disposition: 'attachment' | 'inline', name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  const fallback = /[^_.\s]/.test(ascii.replace(/\.jpg$/i, '')) ? ascii : 'receipt.jpg'
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(name)}`
}
