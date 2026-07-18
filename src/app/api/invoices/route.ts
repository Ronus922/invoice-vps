import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { normalizeVendorName } from '@/lib/vendor-utils'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { validateInvoiceArithmetic } from '@/lib/invoice-validation'
import { normalizeDocType } from '@/lib/doc-type'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// AI extraction sometimes returns numbers as strings ("123.45"). Coerce safely
// so the insert never fails on type alone — accounting accuracy is enforced by
// validateInvoiceArithmetic + needs_review, not by Zod type strictness.
const numericOrNull = z.preprocess((v) => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return v
}, z.number().nullable())

const totalCoerced = z.preprocess((v) => {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  return v
}, z.number())

const InvoiceWriteSchema = z.object({
  date: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  doc_number: z.string().nullable().optional(),
  doc_type: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  pretax: numericOrNull.optional(),
  vat: numericOrNull.optional(),
  total: totalCoerced.optional(),
  currency: z.string().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  source: z.enum(['manual', 'gmail', 'whatsapp', 'folder']).optional(),
  file_url: z.string().nullable().optional(),
  file_name: z.string().nullable().optional(),
  needs_review: z.boolean().optional(),
  validation_error: z.string().nullable().optional(),
  extraction_raw: z.unknown().optional(),
  sent_to_accountant_at: z.string().nullable().optional(),
  accountant_send_error: z.string().nullable().optional(),
})

const SORTABLE_FIELDS = new Set([
  'created_at',
  'updated_at',
  'date',
  'vendor',
  'total',
  'source',
])

async function findRememberedCategory(vendor: string): Promise<string | null> {
  const normalizedTarget = normalizeVendorName(vendor)
  if (!normalizedTarget) return null

  const { data } = await supabase
    .from('invoices')
    .select('vendor, category')
    .not('category', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(500)

  for (const row of data || []) {
    const rowVendor = String(row.vendor || '')
    const rowCategory = String(row.category || '').trim()
    if (!rowCategory) continue
    if (normalizeVendorName(rowVendor) === normalizedTarget) {
      return rowCategory
    }
  }

  return null
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const sortParam = request.nextUrl.searchParams.get('sort') || 'created_at'
  const desc = sortParam.startsWith('-')
  const rawField = desc ? sortParam.slice(1) : sortParam
  const field = SORTABLE_FIELDS.has(rawField) ? rawField : 'created_at'

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order(field, { ascending: !desc })

  if (error) {
    console.error('[invoices GET] supabase error:', error)
    return NextResponse.json({ error: 'טעינת החשבוניות נכשלה' }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const body = await request.json()
  const parsed = InvoiceWriteSchema.safeParse(body)
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((i) => `${i.path.join('.') || '?'}: ${i.message}`)
      .join('; ')
    console.error('[invoices POST] zod error:', fields, 'body keys:', Object.keys(body || {}))
    return NextResponse.json({ error: `נתונים לא תקינים — ${fields}` }, { status: 400 })
  }
  const payload: Record<string, unknown> = { ...parsed.data, created_by: user.id }

  // Always store a canonical doc_type (the DB CHECK rejects anything else).
  payload.doc_type = normalizeDocType(payload.doc_type)

  // DB has NOT NULL on vendor/doc_number; AI sometimes returns null when it
  // can't read those fields. Coerce to '' and force needs_review so the user
  // can fix manually instead of losing the file.
  const vendorMissing = payload.vendor == null || String(payload.vendor).trim() === ''
  const docMissing = payload.doc_number == null || String(payload.doc_number).trim() === ''
  if (vendorMissing) payload.vendor = ''
  if (docMissing) payload.doc_number = ''
  if (vendorMissing || docMissing) {
    payload.needs_review = true
    if (!payload.validation_error) {
      payload.validation_error = vendorMissing && docMissing
        ? 'שם ספק ומספר מסמך חסרים'
        : vendorMissing
          ? 'שם ספק חסר'
          : 'מספר מסמך חסר'
    }
  }

  const vendor = String(payload.vendor || '').trim()
  const category = String(payload.category || '').trim()
  if (vendor && !category) {
    const remembered = await findRememberedCategory(vendor)
    if (remembered) {
      payload.category = remembered
    }
  }

  const { data, error } = await supabase
    .from('invoices')
    .insert(payload)
    .select()
    .single()

  if (error) {
    // Write-time dedup: the partial unique index on (vendor, doc_number, doc_type)
    // rejected a same-identity row. This closes the racy-rescan window (and races
    // between parallel scans) that a stale in-memory snapshot could not. Report it
    // as a skipped duplicate, not a failure — no row was created.
    if (error.code === '23505') {
      console.warn(
        '[invoices POST] duplicate skipped (vendor, doc_number, doc_type):',
        payload.vendor, payload.doc_number, payload.doc_type
      )
      return NextResponse.json({ duplicate: true }, { status: 200 })
    }
    console.error('[invoices POST] supabase error:', error)
    return NextResponse.json(
      { error: `יצירת חשבונית נכשלה — ${error.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const body = await request.json()
  const { id, created_by: _createdBy, ...rest } = body ?? {}
  void _createdBy
  if (!id) {
    return NextResponse.json({ error: 'id חסר' }, { status: 400 })
  }
  const parsed = InvoiceWriteSchema.safeParse(rest)
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })
  }
  const updates: Record<string, unknown> = { ...parsed.data }
  if ('doc_type' in updates) updates.doc_type = normalizeDocType(updates.doc_type)

  const touchedAmounts =
    'pretax' in updates || 'vat' in updates || 'total' in updates
  if (touchedAmounts) {
    const { data: current } = await supabase
      .from('invoices')
      .select('pretax, vat, total')
      .eq('id', id)
      .single()

    const merged = {
      pretax: 'pretax' in updates ? (updates.pretax as number | null) : current?.pretax ?? null,
      vat: 'vat' in updates ? (updates.vat as number | null) : current?.vat ?? null,
      total: 'total' in updates ? (updates.total as number) : current?.total,
    }
    const validation = validateInvoiceArithmetic(merged)
    updates.needs_review = !validation.ok
    updates.validation_error = validation.reason
  }

  const { data, error } = await supabase
    .from('invoices')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[invoices PATCH] supabase error:', error)
    return NextResponse.json({ error: 'עדכון נכשל' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  const { id, ids } = await request.json()

  if (ids && Array.isArray(ids)) {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .in('id', ids)
    if (error) {
      console.error('[invoices DELETE bulk] supabase error:', error)
      return NextResponse.json({ error: 'מחיקה נכשלה' }, { status: 500 })
    }
    return NextResponse.json({ deleted: ids.length })
  }

  if (!id) {
    return NextResponse.json({ error: 'id חסר' }, { status: 400 })
  }

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[invoices DELETE] supabase error:', error)
    return NextResponse.json({ error: 'מחיקה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ deleted: 1 })
}
