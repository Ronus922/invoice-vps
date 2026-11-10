import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { normalizeVendorName } from '@/lib/vendor-utils'
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers'
import { validateInvoiceArithmetic } from '@/lib/invoice-validation'
import { normalizeDocType, isNonInvoiceDocType, NON_INVOICE_REVIEW_MESSAGE } from '@/lib/doc-type'
import { deriveVatFromTotal } from '@/lib/vat-derivation'
import { finalizeInvoicePayload } from '@/lib/invoice-write'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import { findDuplicateDocument } from '@/lib/find-duplicate-document'

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
  source: z.enum(['manual', 'gmail', 'whatsapp', 'folder', 'scan']).optional(),
  file_url: z.string().nullable().optional(),
  file_name: z.string().nullable().optional(),
  needs_review: z.boolean().optional(),
  vat_derived: z.boolean().optional(),
  validation_error: z.string().nullable().optional(),
  extraction_raw: z.unknown().optional(),
  sent_to_accountant_at: z.string().nullable().optional(),
  accountant_send_error: z.string().nullable().optional(),
})

// PATCH treats an empty total as "not provided" (see PATCH handler) — POST
// keeps the coerce-to-0 behavior so a failed extraction still saves the file
// (flagged by the total=0 validator) instead of being rejected.
const InvoicePatchSchema = InvoiceWriteSchema.extend({
  total: numericOrNull.optional(),
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

  // PostgREST answers at most max-rows (1000) per request, silently — one plain select would drop every row
  // past the 1000th (the oldest invoices vanished from the home page at 1057 rows). So: page through the
  // table. `id` is the tie-breaker: many rows share a vendor / source / date, and without a total order the
  // pages could repeat or skip rows.
  const { data, error } = await fetchAllRows<Record<string, unknown>>(
    (from, to) =>
      supabase
        .from('invoices')
        .select('*')
        .order(field, { ascending: !desc })
        .order('id', { ascending: true })
        .range(from, to),
    { key: (row) => String(row.id) },
  )

  if (error) {
    console.error('[invoices GET] supabase error:', error)
    return NextResponse.json({ error: 'טעינת החשבוניות נכשלה' }, { status: 500 })
  }

  return NextResponse.json(data)
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

  // doc_type canonicalisation, non-invoice gate, identity coercion and the VAT fallback —
  // one shared step (src/lib/invoice-write.ts) so the receipt scan takes the same road.
  finalizeInvoicePayload(payload)

  // Write-time dedup on the document's identity (src/lib/doc-identity.ts): normalised doc_number + date + total
  // (+ the vendor's tax id when both sides have one). The vendor's spelling and the doc_type are not part of it.
  // Reported as a skipped duplicate (200, no row) — the same answer the unique-index hit below gives. A failed
  // lookup does not block the insert: the unique index on (vendor, doc_number, doc_type) is still the net.
  try {
    const existing = await findDuplicateDocument(supabase, payload)
    if (existing) {
      console.warn('[invoices POST] duplicate skipped: same document as', existing.id)
      return NextResponse.json({ duplicate: true }, { status: 200 })
    }
  } catch (err) {
    console.error('[invoices POST] duplicate lookup failed, relying on the unique index:', err instanceof Error ? err.message : err)
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
  const parsed = InvoicePatchSchema.safeParse(rest)
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })
  }
  const updates: Record<string, unknown> = { ...parsed.data }
  if ('doc_type' in updates) updates.doc_type = normalizeDocType(updates.doc_type)
  // On PATCH an empty total means "not provided" — dropping it keeps the
  // current value instead of zeroing a valid total (which would flag the row).
  if ('total' in updates && updates.total == null) delete updates.total

  const touchedAmounts =
    'pretax' in updates || 'vat' in updates || 'total' in updates
  const touchedDocType = 'doc_type' in updates
  // Recompute review state when amounts change OR doc_type changes — flipping
  // a false-positive 'other' back to 'invoice' must clear the review flag, and
  // marking a row 'other' must set it.
  if (touchedAmounts || touchedDocType) {
    const { data: current } = await supabase
      .from('invoices')
      .select('pretax, vat, total, currency, date, doc_type')
      .eq('id', id)
      .single()

    const merged = {
      pretax: 'pretax' in updates ? (updates.pretax as number | null) : current?.pretax ?? null,
      vat: 'vat' in updates ? (updates.vat as number | null) : current?.vat ?? null,
      total: 'total' in updates ? (updates.total as number) : current?.total,
    }
    // Same VAT fallback as POST; when the user supplies balanced pretax+vat
    // this is a passthrough and clears the derived marker (human-entered).
    const derivation = deriveVatFromTotal({
      ...merged,
      currency: current?.currency ?? null,
      date: current?.date ?? null,
    })
    if (touchedAmounts) {
      updates.pretax = derivation.pretax
      updates.vat = derivation.vat
      updates.vat_derived = derivation.vatDerived
    }
    const validation = validateInvoiceArithmetic({
      pretax: derivation.pretax,
      vat: derivation.vat,
      total: merged.total,
    })
    const effectiveDocType = touchedDocType ? updates.doc_type : current?.doc_type
    const nonInvoice = isNonInvoiceDocType(effectiveDocType)
    updates.needs_review = !validation.ok || nonInvoice
    updates.validation_error = nonInvoice ? NON_INVOICE_REVIEW_MESSAGE : validation.reason
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
