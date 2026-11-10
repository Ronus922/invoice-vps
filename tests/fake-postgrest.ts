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
  /** `.eq()` filters as `column=value`. Recorded only — the fake does not filter, the test feeds it matching rows. */
  filters: string[]
}

interface Result {
  data: Row[] | null
  error: { message: string; code?: string } | null
}

export const fake = {
  tables: new Map<string, Row[]>(),
  calls: [] as RecordedCall[],
  /** Called after each request is answered (1-based request number): lets a test change the table mid-paging. */
  afterRequest: null as ((n: number) => void) | null,
  /** Request number (1-based) that fails with a database error. */
  failOnRequest: null as number | null,
  requests: 0,
  reset(tables: Record<string, Row[]> = {}) {
    this.tables = new Map(Object.entries(tables))
    this.calls = []
    this.afterRequest = null
    this.failOnRequest = null
    this.requests = 0
  },
}

class Query implements PromiseLike<Result> {
  private orders: Array<{ field: string; asc: boolean }> = []
  private filters: string[] = []
  private window: { from: number; to: number } | null = null

  constructor(private readonly table: string) {}

  select() { return this }
  not() { return this }
  is() { return this }
  eq(field: string, value: unknown) {
    this.filters.push(`${field}=${String(value)}`)
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
