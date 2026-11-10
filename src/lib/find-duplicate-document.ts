// "Does this document already exist?" — asked of the database by the server roads (Gmail scan,
// POST /api/invoices, the phone scan and its early warning). The rule is src/lib/doc-identity.ts.
//
// The query narrows by the total (a half-cent window around it, so a stored 155.704 still comes back for 155.70)
// and the identity is then decided in code: the normalised document number cannot be compared in SQL without a
// migration, and legacy rows hold numbers with zeros, spaces and hyphens. Rows sharing one total are few;
// they are still read through fetchAllRows so a very common amount can never be cut at PostgREST's 1000-row
// ceiling (which would let a duplicate through).
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from './fetch-all-rows'
import { documentIdentity, isSameDocument, type IdentityInput } from './doc-identity'
import { isTaxInvoiceType } from './doc-upgrade'

/** What the screens show about the existing row. */
export interface DuplicateRow {
  id: string
  vendor: string
  doc_number: string
  doc_type: string
  date: string | null
  total: number | null
  currency: string | null
  source: string | null
  created_at: string
  vendor_tax_id: string | null
}

const COLUMNS = 'id, vendor, doc_number, doc_type, date, total, currency, source, created_at, vendor_tax_id'

/** The existing row that is the same document as `candidate` — the earliest, except that a tax invoice outranks a
 *  receipt — or null (also when `candidate` has no identity: no number or no total).
 *  Throws on a database error: "could not look" is not "no duplicate". */
export async function findDuplicateDocument(
  db: Pick<SupabaseClient, 'from'>,
  candidate: IdentityInput,
): Promise<DuplicateRow | null> {
  const wanted = documentIdentity(candidate)
  if (!wanted) return null
  const { data, error } = await fetchAllRows<DuplicateRow>(
    (from, to) =>
      db
        .from('invoices')
        .select(COLUMNS)
        .gte('total', Number((wanted.totalCents / 100 - 0.005).toFixed(3)))
        .lt('total', Number((wanted.totalCents / 100 + 0.005).toFixed(3)))
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    { key: (row) => row.id },
  )
  if (error) throw new Error(`duplicate_lookup_failed:${error.code ?? 'unknown'}`)
  const matches = data.filter((row) => {
    const id = documentIdentity(row)
    return id !== null && isSameDocument(wanted, id)
  })
  // When the table already holds a tax invoice of this document, THAT is the existing document — never an earlier
  // receipt of it: otherwise a new tax invoice would "upgrade" the receipt and leave two tax invoices (src/lib/doc-upgrade.ts).
  return matches.find((row) => isTaxInvoiceType(row.doc_type)) ?? matches[0] ?? null
}
