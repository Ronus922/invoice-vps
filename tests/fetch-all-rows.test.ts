import { describe, it, expect } from 'vitest'
import { fetchAllRows, type PageResult } from '@/lib/fetch-all-rows'

// A table of `n` rows, read through a server that never answers with more than `cap` rows (PostgREST max-rows).
function server(n: number, cap = 1000) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `r${String(i).padStart(5, '0')}` }))
  const asked: Array<[number, number]> = []
  const page = async (from: number, to: number): Promise<PageResult<{ id: string }>> => {
    asked.push([from, to])
    return { data: rows.slice(from, from + Math.min(to - from + 1, cap)), error: null }
  }
  return { rows, asked, page }
}

describe('fetchAllRows', () => {
  it('returns every row of a table larger than the 1000-row server cap (the home-page bug: 1057 rows → 1000)', async () => {
    const s = server(1057)
    const { data, error } = await fetchAllRows(s.page)
    expect(error).toBeNull()
    expect(data).toHaveLength(1057)
    expect(data).toEqual(s.rows)
  })

  it('walks the table in pages of 1000 and stops on the first empty page', async () => {
    const s = server(2500)
    await fetchAllRows(s.page)
    expect(s.asked).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]])
  })

  it('handles an exact multiple of the page size (the next page is empty, nothing is lost or repeated)', async () => {
    const s = server(2000)
    const { data } = await fetchAllRows(s.page)
    expect(data).toHaveLength(2000)
    expect(s.asked).toHaveLength(3)
  })

  it('returns an empty list for an empty table', async () => {
    const { data, error } = await fetchAllRows(server(0).page)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('still returns everything if the server cap is ever set below the page size', async () => {
    const s = server(1057, 300)
    const { data } = await fetchAllRows(s.page)
    expect(data).toEqual(s.rows)
  })

  it('reports a database error instead of returning the rows read so far', async () => {
    const s = server(2500)
    let calls = 0
    const { data, error } = await fetchAllRows<{ id: string }>(async (from, to) => {
      calls += 1
      return calls === 2 ? { data: null, error: { message: 'boom', code: 'XX000' } } : s.page(from, to)
    })
    expect(data).toBeNull()
    expect(error).toEqual({ message: 'boom', code: 'XX000' })
    expect(calls).toBe(2)
  })

  it('keeps a row once when an insert between two pages shifts the next page by one', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: `r${i}` }))
    let call = 0
    const { data } = await fetchAllRows<{ id: string }>(
      async (from, to) => {
        call += 1
        const out = rows.slice(from, from + Math.min(to - from + 1, 1000))
        if (call === 1) rows.unshift({ id: 'new' }) // a newer row lands at the head: every later offset moves by one
        return { data: out, error: null }
      },
      { key: (r) => r.id },
    )
    const ids = (data ?? []).map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(1500) // r0..r1499 once each; 'new' arrived after page 1 was cut and is picked up next time
  })

  it('refuses to load an unbounded table instead of looping on', async () => {
    const { data, error } = await fetchAllRows(server(5000).page, { maxRows: 2000 })
    expect(data).toBeNull()
    expect(error?.message).toMatch(/more than 2000 rows/)
  })
})
