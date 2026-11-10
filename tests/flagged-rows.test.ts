import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NON_INVOICE_REVIEW_MESSAGE } from '@/lib/doc-type'
import { fetchFlaggedRows } from '@/lib/flagged-rows'
import { fake, fakeClient, type Row } from './fake-postgrest'

// scripts/retriage-flagged.ts re-judges every flagged invoice. Its query used to be one plain select: the shared
// PostgREST cuts a response at 1000 rows without an error, so once more than 1000 rows were flagged the rest
// would never have been re-judged. The fake database has that cap and flips the order of tied rows.

const client = fakeClient as unknown as Pick<SupabaseClient, 'from'>

function flagged(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${String(i).padStart(5, '0')}`,
    vendor: 'ספק',
    doc_number: String(i),
    total: i,
    // 10 rows per second: the ORDER BY created_at alone leaves heavy ties
    created_at: new Date(Date.UTC(2026, 6, 30) + Math.floor(i / 10) * 1000).toISOString(),
  }))
}

describe('fetchFlaggedRows', () => {
  beforeEach(() => fake.reset())

  it('returns every flagged row when more than 1000 are flagged — each exactly once', async () => {
    fake.reset({ invoices: flagged(1057) })
    const { data, error } = await fetchFlaggedRows(client)
    expect(error).toBeNull()
    expect(data).toHaveLength(1057)
    expect(new Set(data!.map((r) => r.id)).size).toBe(1057)
  })

  it('reads in pages (a single query would stop at 1000) and orders by created_at then the unique id', async () => {
    fake.reset({ invoices: flagged(2500) })
    const { data } = await fetchFlaggedRows(client)
    expect(data).toHaveLength(2500)
    expect(fake.calls.length).toBeGreaterThan(1)
    expect(fake.calls.every((c) => c.table === 'invoices')).toBe(true)
    expect(fake.calls.every((c) => c.orders.join(',') === 'created_at,id')).toBe(true)
  })

  it('keeps a row once when a new flagged row lands before the cursor between two pages', async () => {
    const rows = flagged(1500)
    const original = rows.map((r) => String(r.id)) // the fake stores `rows` itself, so copy the ids before the insert
    fake.reset({ invoices: rows })
    fake.afterRequest = (n) => {
      // the first page was just served; a newly flagged row sorts BEFORE everything, shifting the next page by one
      if (n === 1) fake.tables.get('invoices')!.push({ id: 'id-00000-new', vendor: 'חדש', doc_number: 'n', total: 1, created_at: '2026-01-01T00:00:00.000Z' })
    }
    const { data } = await fetchFlaggedRows(client)
    const ids = data!.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length) // no row repeated
    expect(original.every((id) => ids.includes(id))).toBe(true) // none of the 1500 lost
  })

  it('asks only for rows flagged needs_review with the non-invoice message', async () => {
    fake.reset({ invoices: flagged(3) })
    await fetchFlaggedRows(client)
    expect(fake.calls).toHaveLength(2) // the 3 rows, then the empty page that ends the loop
    expect(fake.calls.every((c) => c.filters.join('|') === `needs_review=true|validation_error=${NON_INVOICE_REVIEW_MESSAGE}`)).toBe(true)
  })

  it('handles nothing flagged (the state of production on 2026-11-10)', async () => {
    fake.reset({ invoices: [] })
    const { data, error } = await fetchFlaggedRows(client)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('reports a database error instead of returning a partial list', async () => {
    fake.reset({ invoices: flagged(1500) })
    fake.failOnRequest = 2
    const { data, error } = await fetchFlaggedRows(client)
    expect(data).toBeNull()
    expect(error?.message).toBe('boom')
  })
})

describe('scripts/retriage-flagged.ts', () => {
  const source = readFileSync(new URL('../scripts/retriage-flagged.ts', import.meta.url), 'utf8')

  // The script runs on import (it reads .env.local and calls the API), so it cannot be loaded by a test.
  // This pins the one thing that matters: it gets its rows through the paged helper, not its own plain query.
  it('loads its rows through fetchFlaggedRows, not an unpaged query of its own', () => {
    expect(source).toMatch(/await fetchFlaggedRows\(supabase\)/)
    expect(source).not.toMatch(/\.eq\('needs_review'/)
  })
})
