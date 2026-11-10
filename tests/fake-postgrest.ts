// A stand-in for the supabase-js query builder that behaves like the shared PostgREST for the calls the app
// makes: chained `.select().order().range()`, awaited. It reproduces the two traps behind the 2026-11-10 bug:
//   1. max-rows — a response never holds more than MAX_ROWS (1000) rows, whatever the query asks for, and says nothing;
//   2. ties — rows the ORDER BY does not separate come back in no promised order, and the order may differ from
//      one request to the next. The fake flips the tie order on every second request, so a query whose order does not
//      end in a unique column repeats / skips rows between pages, exactly like the real database may.
export const MAX_ROWS = 1000

export type Row = Record<string, string | number | null>

export interface RecordedCall {
  table: string
  from: number
  to: number | null
  orders: string[]
  /** `.eq()` / `.gte()` / `.lt()` filters as `column=value`, `column>=value`, `column<value`. Recorded only — the fake does not filter, the test feeds it matching rows. */
  filters: string[]
}

interface Result {
  data: Row[] | Row | null
  error: { message: string; code?: string } | null
}

export const fake = {
  tables: new Map<string, Row[]>(),
  calls: [] as RecordedCall[],
  /** Called after each request is answered (1-based request number): lets a test change the table mid-paging. */
  afterRequest: null as ((n: number) => void) | null,
  /** Request number (1-based) that fails with a database error. */
  failOnRequest: null as number | null,
  /** When set, every insert fails with this error (e.g. { code: '23505' } — the unique index). */
  insertError: null as { message: string; code?: string } | null,
  /** The rows inserted through `.insert()`, in order. */
  inserted: [] as Row[],
  /** Every `.update()` as { values, filters } (the `.eq()` filters it carried), in order. */
  updates: [] as Array<{ values: Record<string, unknown>; filters: string[] }>,
  /** When set, every update fails with this error (e.g. { code: '23505' }). */
  updateError: null as { message: string; code?: string } | null,
  requests: 0,
  reset(tables: Record<string, Row[]> = {}) {
    this.tables = new Map(Object.entries(tables))
    this.calls = []
    this.afterRequest = null
    this.failOnRequest = null
    this.insertError = null
    this.inserted = []
    this.updates = []
    this.updateError = null
    this.requests = 0
  },
}

class Query implements PromiseLike<Result> {
  private orders: Array<{ field: string; asc: boolean }> = []
  private filters: string[] = []
  private window: { from: number; to: number } | null = null
  private toInsert: Record<string, unknown> | null = null
  private toUpdate: Record<string, unknown> | null = null
  private wantsOne = false

  constructor(private readonly table: string) {}

  select() { return this }
  not() { return this }
  is() { return this }
  eq(field: string, value: unknown) {
    this.filters.push(`${field}=${String(value)}`)
    return this
  }
  gte(field: string, value: unknown) {
    this.filters.push(`${field}>=${String(value)}`)
    return this
  }
  lt(field: string, value: unknown) {
    this.filters.push(`${field}<${String(value)}`)
    return this
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orders.push({ field, asc: options?.ascending !== false })
    return this
  }

  range(from: number, to: number) {
    this.window = { from, to }
    return this
  }

  limit(n: number) {
    this.window = { from: 0, to: n - 1 }
    return this
  }

  insert(row: Record<string, unknown>) {
    this.toInsert = row
    return this
  }

  update(values: Record<string, unknown>) {
    this.toUpdate = values
    return this
  }

  single() {
    this.wantsOne = true
    return this
  }

  /** Rows matching every `.eq()` filter of this query — used ONLY by update and by `.single()` reads (a plain select
   *  still only records its filters: the test feeds it matching rows). */
  private matching(rows: Row[]): Row[] {
    const eqs = this.filters.filter((f) => /^[a-z_]+=/.test(f)).map((f) => f.split('=') as [string, string])
    return rows.filter((r) => eqs.every(([k, v]) => String(r[k]) === v))
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected)
  }

  private run(): Result {
    fake.requests += 1
    const n = fake.requests
    fake.calls.push({ table: this.table, from: this.window?.from ?? 0, to: this.window?.to ?? null, orders: this.orders.map((o) => o.field), filters: this.filters })
    if (fake.failOnRequest === n) return { data: null, error: { message: 'boom', code: 'XX000' } }
    if (this.toInsert) {
      if (fake.insertError) return { data: null, error: fake.insertError }
      const row = { id: `new-${fake.inserted.length + 1}`, ...this.toInsert } as Row
      fake.inserted.push(row)
      fake.tables.set(this.table, [...(fake.tables.get(this.table) ?? []), row])
      return { data: row, error: null }
    }

    if (this.toUpdate) {
      if (fake.updateError) return { data: null, error: fake.updateError }
      fake.updates.push({ values: this.toUpdate, filters: this.filters })
      const hit = this.matching(fake.tables.get(this.table) ?? [])
      for (const r of hit) Object.assign(r, this.toUpdate)
      return { data: hit.map((r) => ({ id: r.id })) as Row[], error: null }
    }
    if (this.wantsOne) {
      const one = this.matching(fake.tables.get(this.table) ?? [])[0] ?? null
      return one ? { data: one, error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } }
    }

    const stored = fake.tables.get(this.table) ?? []
    const base = n % 2 === 0 ? stored.slice().reverse() : stored.slice() // the unspecified tie order
    const sorted = base.sort((a, b) => {
      for (const { field, asc } of this.orders) {
        const x = a[field] ?? ''
        const y = b[field] ?? ''
        if (x < y) return asc ? -1 : 1
        if (x > y) return asc ? 1 : -1
      }
      return 0
    })
    const from = this.window?.from ?? 0
    const asked = this.window ? this.window.to - this.window.from + 1 : MAX_ROWS
    const data = sorted.slice(from, from + Math.min(asked, MAX_ROWS))
    fake.afterRequest?.(n)
    return { data, error: null }
  }
}

export const fakeClient = {
  from: (table: string) => new Query(table),
}
