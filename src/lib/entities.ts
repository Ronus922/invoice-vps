export interface Invoice {
  id: string
  date: string | null
  vendor: string
  doc_number: string
  description: string | null
  pretax: number | null
  vat: number | null
  total: number
  payment_method: string | null
  category: string | null
  source: 'manual' | 'gmail' | 'whatsapp'
  file_url: string | null
  file_name: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface SyncState {
  id: string
  source: string | null
  history_id: string | null
  created_at: string
  updated_at: string
}

export const InvoiceEntity = {
  async list(sortField?: string) {
    const params = new URLSearchParams()
    if (sortField) params.set('sort', sortField)
    const res = await fetch(`/api/invoices?${params}`)
    if (!res.ok) throw new Error('Failed to fetch invoices')
    return (await res.json()) as Invoice[]
  },

  async create(record: Partial<Invoice>) {
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    })
    if (!res.ok) throw new Error('Failed to create invoice')
    return (await res.json()) as Invoice
  },

  async update(id: string, updates: Partial<Invoice>) {
    const res = await fetch('/api/invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    if (!res.ok) throw new Error('Failed to update invoice')
    return (await res.json()) as Invoice
  },

  async delete(id: string) {
    const res = await fetch('/api/invoices', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) throw new Error('Failed to delete invoice')
  },

  async filter(query: Record<string, unknown>) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      params.set(key, String(value))
    }
    const res = await fetch(`/api/invoices?${params}`)
    if (!res.ok) throw new Error('Failed to filter invoices')
    return (await res.json()) as Invoice[]
  },
}

export const SyncStateEntity = {
  async list() {
    // Not used in frontend currently
    return [] as SyncState[]
  },
  async create(record: Partial<SyncState>) {
    void record
    return {} as SyncState
  },
  async update(id: string, updates: Partial<SyncState>) {
    void id
    void updates
    return {} as SyncState
  },
  async filter(query: Record<string, unknown>) {
    void query
    return [] as SyncState[]
  },
}
