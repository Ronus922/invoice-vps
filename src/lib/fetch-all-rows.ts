// Reads EVERY row of a Supabase/PostgREST query, page by page.
//
// Why this exists: the shared Supabase PostgREST caps every response at `max-rows` (1000). A query without
// `.range()` silently returns the first 1000 rows and no error, so a list that grows past 1000 rows loses
// the rest without a sign (2026-11-10: the home page stopped showing the oldest invoices at 1057 rows).
// `.limit(3000)` does NOT help — the server cap still wins. Use this helper for any query that must see all
// rows; a deliberate cap (`.limit(25)`, `.limit(1)`) does not need it.
//
// The caller MUST give the query a total, repeatable order that ends in a unique column (`.order('id')` last):
// with ties (many rows share one vendor / source / date) the database may order them differently from one
// page to the next, and rows would be repeated or skipped.
//
// The loop steps by the rows a page actually returned (not by the nominal page size) and stops only on an
// empty page, so it stays correct even if the server cap is ever set below `pageSize`. A row inserted
// between two pages can shift the next page by one: pass `key` to drop the repeated row.

export const PAGE_SIZE = 1000
const MAX_ROWS = 200_000

export interface PageError {
  message: string
  code?: string
}

export interface PageResult<T> {
  data: T[] | null
  error: PageError | null
}

export type AllRowsResult<T> = { data: T[]; error: null } | { data: null; error: PageError }

export interface FetchAllOptions<T> {
  pageSize?: number
  /** Safety stop: more rows than this is reported as an error instead of looping on. */
  maxRows?: number
  /** Unique identity of a row (e.g. its id); a row seen twice across pages is kept once. */
  key?: (row: T) => string
}

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: FetchAllOptions<T> = {},
): Promise<AllRowsResult<T>> {
  const pageSize = options.pageSize ?? PAGE_SIZE
  const maxRows = options.maxRows ?? MAX_ROWS
  const rows: T[] = []
  const seen = options.key ? new Set<string>() : null
  let from = 0

  for (;;) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) return { data: null, error }
    if (!data || data.length === 0) break
    from += data.length
    for (const row of data) {
      if (seen && options.key) {
        const id = options.key(row)
        if (seen.has(id)) continue
        seen.add(id)
      }
      rows.push(row)
    }
    if (from > maxRows) return { data: null, error: { message: `more than ${maxRows} rows — refusing to load them all` } }
  }
  return { data: rows, error: null }
}
