// What makes two rows the SAME DOCUMENT — one definition for every road into the `invoices` table
// (Gmail scan, folder scan, manual upload, phone scan and its early warning, POST /api/invoices).
//
//   identity = normalised doc_number + date + total
//              (+ vendor_tax_id, but only when BOTH sides have one — then they must agree)
//   (every road reads the issuer's tax id since 2026-11-10; rows stored before that carry none, so for them it does not apply)
//
// The vendor's spelling and the document type are NOT part of it. OCR re-spells the same company
// ("MAX" / "ביג מקס" / "מקס סטוק - אדמירלטי…") and the same file is read once as 'unknown' and once as
// 'invoice_receipt', yet it is one expense; an identity that included either let hundreds of copies in.
//
// Pure: no I/O, no React, no server-only imports — the browser (upload zone, folder scan) and the server use it.
// The database check that goes with it is src/lib/find-duplicate-document.ts. There is deliberately NO unique
// index on this identity yet: the table still holds duplicates (docs/document-identity.md, "after the cleanup").
import { toIsoDate } from './scan/format'

/** Anything that carries the fields an identity is made of — a table row, an extraction result, a form. */
export interface IdentityInput {
  doc_number?: unknown
  date?: unknown
  total?: unknown
  vendor_tax_id?: unknown
}

export interface DocIdentity {
  /** Upper-case letters and digits only, no leading zeros. */
  docNumber: string
  /** `YYYY-MM-DD`, or '' when the date is missing or not a real date (the table also stores '<UNKNOWN>'). */
  date: string
  /** The total in cents (rounded), never 0. */
  totalCents: number
  /** Digits only; '' when absent. */
  taxId: string
}

/** "00570106008278" / "0057-0106 008278" / "570106008278" → "570106008278". Spaces, hyphens and any other
 *  separator are dropped, letters are upper-cased, leading zeros go. '' when nothing is left. */
export function normalizeDocNumber(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return ''
  return String(raw)
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/^0+/, '')
}

/** `YYYY-MM-DD` from the table's `DD/MM/YYYY` or a form's ISO value; '' for anything else (including '<UNKNOWN>'). */
export function normalizeDocDate(raw: unknown): string {
  return toIsoDate(raw)
}

/** A total as cents; null when it is missing, not a number, or 0 (a failed read — there is nothing to compare). */
export function totalToCents(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  return cents === 0 ? null : cents
}

/** An Israeli company / dealer number: 8–9 digits. Anything else (an OCR misread, a foreign VAT id) counts as absent,
 *  so a garbled id on one side cannot turn the same document into "another issuer". */
export function normalizeTaxId(raw: unknown): string {
  const digits = typeof raw === 'string' || typeof raw === 'number' ? String(raw).replace(/\D/g, '') : ''
  return digits.length >= 8 && digits.length <= 9 ? digits : ''
}

/** True when the date is genuinely missing: empty, or the table's '<UNKNOWN>'. A date that is there but cannot be
 *  read is not "missing" — see documentIdentity. */
function isMissingDate(raw: unknown): boolean {
  return typeof raw !== 'string' || raw.trim() === '' || /^<?unknown>?$/i.test(raw.trim())
}

/** The identity of a document, or null when it has none: no document number, no total, or a date that is written
 *  but unreadable (two different documents with garbled dates must not collapse into one). Such a row is never
 *  called a duplicate here (the table's unique index on vendor + number + type still applies to it). */
export function documentIdentity(row: IdentityInput): DocIdentity | null {
  const docNumber = normalizeDocNumber(row.doc_number)
  const totalCents = totalToCents(row.total)
  if (docNumber === '' || totalCents === null) return null
  const date = normalizeDocDate(row.date)
  if (date === '' && !isMissingDate(row.date)) return null
  return { docNumber, date, totalCents, taxId: normalizeTaxId(row.vendor_tax_id) }
}

/** A string that is equal for two identities that can be the same document regardless of the tax id — used to
 *  serialise two writers working on the same document inside one process. */
export function identityKey(id: DocIdentity): string {
  return `${id.docNumber}|${id.date}|${id.totalCents}`
}

export function isSameDocument(a: DocIdentity, b: DocIdentity): boolean {
  if (a.docNumber !== b.docNumber || a.date !== b.date || a.totalCents !== b.totalCents) return false
  return a.taxId === '' || b.taxId === '' || a.taxId === b.taxId
}

/** The first row of `rows` that is the same document as `candidate` — for the browser, which holds the full list. */
export function findDuplicateInList<T extends IdentityInput>(rows: readonly T[], candidate: IdentityInput): T | null {
  const wanted = documentIdentity(candidate)
  if (!wanted) return null
  for (const row of rows) {
    const id = documentIdentity(row)
    if (id && isSameDocument(wanted, id)) return row
  }
  return null
}
