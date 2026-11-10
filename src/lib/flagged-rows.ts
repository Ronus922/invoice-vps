// The rows scripts/retriage-flagged.ts re-judges: every invoice flagged "not an invoice — check".
//
// Read through fetchAllRows: the shared PostgREST answers at most 1000 rows per request and says nothing, so a
// single unpaged query would silently drop the rest once more than 1000 rows are flagged (see fetch-all-rows.ts).
// The order ends in the unique `id`, which paging needs to stay repeatable.
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, type AllRowsResult } from './fetch-all-rows'
import { NON_INVOICE_REVIEW_MESSAGE } from './doc-type'

export interface FlaggedRow {
  id: string
  vendor: string
  doc_number: string
  total: number
  pretax: number | null
  vat: number | null
  file_url: string | null
  file_name: string | null
  date: string | null
}

const FLAGGED_COLUMNS = 'id, vendor, doc_number, total, pretax, vat, file_url, file_name, date'

export function fetchFlaggedRows(supabase: Pick<SupabaseClient, 'from'>): Promise<AllRowsResult<FlaggedRow>> {
  return fetchAllRows<FlaggedRow>(
    (from, to) =>
      supabase
        .from('invoices')
        .select(FLAGGED_COLUMNS)
        .eq('needs_review', true)
        .eq('validation_error', NON_INVOICE_REVIEW_MESSAGE)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    { key: (row) => row.id },
  )
}
