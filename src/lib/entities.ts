import type { DocType } from '@/lib/doc-type'

export interface Invoice {
  id: string
  date: string | null
  vendor: string
  doc_number: string
  doc_type: DocType
  description: string | null
  pretax: number | null
  vat: number | null
  total: number
  currency: string
  payment_method: string | null
  category: string | null
  source: 'manual' | 'gmail' | 'whatsapp' | 'folder'
  file_url: string | null
  file_name: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  needs_review: boolean
  validation_error: string | null
  extraction_raw: ExtractionRaw | null
  sent_to_accountant_at: string | null
  accountant_send_error: string | null
}

export interface ExtractionRaw {
  model: string
  raw_text: string
  parsed: unknown
  validation_error: string | null
  scanned_at: string
  source: 'manual' | 'gmail' | 'whatsapp' | 'folder'
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  const serverMsg = body && typeof body.error === 'string' ? body.error : null
  return serverMsg ? `${fallback} (${res.status}): ${serverMsg}` : `${fallback} (${res.status})`
}

export const InvoiceEntity = {
  async list(sortField?: string) {
    const params = new URLSearchParams()
    if (sortField) params.set('sort', sortField)
    const res = await fetch(`/api/invoices?${params}`)
    if (!res.ok) throw new Error(await readError(res, 'טעינת חשבוניות נכשלה'))
    return (await res.json()) as Invoice[]
  },

  // On a (vendor, doc_number, doc_type) unique-index conflict the server returns
  // { duplicate: true } (200) instead of a row — the write-time dedup that closes
  // the racy-rescan window. Callers must check for it before treating as created.
  async create(record: Partial<Invoice>): Promise<Invoice | { duplicate: true }> {
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    })
    if (!res.ok) throw new Error(await readError(res, 'יצירת חשבונית נכשלה'))
    return (await res.json()) as Invoice | { duplicate: true }
  },

  async update(id: string, updates: Partial<Invoice>) {
    const res = await fetch('/api/invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    if (!res.ok) throw new Error(await readError(res, 'עדכון חשבונית נכשל'))
    return (await res.json()) as Invoice
  },

  async delete(id: string) {
    const res = await fetch('/api/invoices', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) throw new Error(await readError(res, 'מחיקת חשבונית נכשלה'))
  },
}
