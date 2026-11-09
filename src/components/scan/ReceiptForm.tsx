'use client'

import { AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { DOC_TYPES, type DocType } from '@/lib/doc-type'
import { DOC_TYPE_LABELS, type ScanField, type ScanValues } from '@/lib/scan/model'

// The review form of a scanned receipt: every field the OCR read, editable. A field the OCR was
// unsure of (confidence < 0.7) is painted yellow AND labelled "בדוק" — never colour alone.
// RTL, every control at least 44px tall (touch target).

const CURRENCIES = [
  { code: 'ILS', label: '₪ שקל' },
  { code: 'USD', label: '$ דולר' },
  { code: 'EUR', label: '€ יורו' },
  { code: 'GBP', label: '£ ליש״ט' },
]
const PAYMENT_METHODS = ['אשראי', 'העברה בנקאית', 'מזומן', 'אחר']

const FIELD_LABEL = 'mb-1.5 block text-[13px] font-semibold'
const CONTROL = 'h-11 px-3 py-2 text-base'
const LOW = 'border-amber-400 bg-amber-400/15 ring-1 ring-amber-400/40'

interface Props {
  values: ScanValues
  onChange: (patch: Partial<ScanValues>) => void
  lowConfidence: ReadonlySet<ScanField>
  disabled?: boolean
}

/** One labelled field. Top-level on purpose: a component declared inside ReceiptForm would be a new type on
 *  every keystroke and remount (blur) the input being typed in. */
function Field({ field, label, low, children }: { field: ScanField; label: string; low: boolean; children: React.ReactNode }) {
  return (
    <div data-field={field} data-low-confidence={low ? 'true' : undefined}>
      <Label htmlFor={`scan-${field}`} className={cn(FIELD_LABEL, low && 'text-amber-300')}>
        {label}
        {low && (
          <span className="mr-2 inline-flex items-center gap-1 text-[12px] font-bold text-amber-300">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            בדוק
          </span>
        )}
      </Label>
      {children}
    </div>
  )
}

export function ReceiptForm({ values, onChange, lowConfidence, disabled = false }: Props) {
  const low = (f: ScanField) => lowConfidence.has(f)

  const text = (field: ScanField, opts: { inputMode?: 'numeric' | 'decimal' | 'text'; ltr?: boolean; type?: string } = {}) => (
    <Input
      id={`scan-${field}`}
      type={opts.type ?? 'text'}
      inputMode={opts.inputMode}
      dir={opts.ltr ? 'ltr' : 'rtl'}
      value={values[field]}
      disabled={disabled}
      onChange={(e) => onChange({ [field]: e.target.value } as Partial<ScanValues>)}
      className={cn(CONTROL, opts.ltr && 'text-left', low(field) && LOW)}
    />
  )

  const select = (field: ScanField, options: { value: string; label: string }[]) => (
    <select
      id={`scan-${field}`}
      value={values[field]}
      disabled={disabled}
      onChange={(e) => onChange({ [field]: e.target.value } as Partial<ScanValues>)}
      className={cn(
        'w-full rounded-xl border border-white/15 bg-white/10 text-white [color-scheme:dark] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/50 disabled:opacity-50',
        CONTROL,
        low(field) && LOW,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#0e1f3d]">
          {o.label}
        </option>
      ))}
    </select>
  )

  const currencyOptions = CURRENCIES.some((c) => c.code === values.currency)
    ? CURRENCIES
    : [...CURRENCIES, { code: values.currency, label: values.currency }]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" dir="rtl">
      <Field field="doc_type" label="סוג מסמך" low={low('doc_type')}>
        {select('doc_type', DOC_TYPES.map((t: DocType) => ({ value: t, label: DOC_TYPE_LABELS[t] })))}
      </Field>
      <Field field="date" label="תאריך המסמך" low={low('date')}>
        {text('date', { type: 'date', ltr: true })}
      </Field>

      <Field field="vendor" label="שם הספק (מנפיק המסמך)" low={low('vendor')}>
        {text('vendor')}
      </Field>
      <Field field="vendor_tax_id" label="ח.פ / עוסק מורשה" low={low('vendor_tax_id')}>
        {text('vendor_tax_id', { inputMode: 'numeric', ltr: true })}
      </Field>

      <Field field="doc_number" label="מספר מסמך" low={low('doc_number')}>
        {text('doc_number', { ltr: true })}
      </Field>
      <Field field="payment_method" label="אמצעי תשלום" low={low('payment_method')}>
        <>
          <Input
            id="scan-payment_method"
            list="scan-payment-methods"
            value={values.payment_method}
            disabled={disabled}
            onChange={(e) => onChange({ payment_method: e.target.value })}
            className={cn(CONTROL, low('payment_method') && LOW)}
          />
          <datalist id="scan-payment-methods">
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </>
      </Field>

      <Field field="pretax" label="לפני מע״מ" low={low('pretax')}>
        {text('pretax', { inputMode: 'decimal', ltr: true })}
      </Field>
      <Field field="vat" label="מע״מ" low={low('vat')}>
        {text('vat', { inputMode: 'decimal', ltr: true })}
      </Field>

      <Field field="total" label="סה״כ לתשלום" low={low('total')}>
        {text('total', { inputMode: 'decimal', ltr: true })}
      </Field>
      <Field field="currency" label="מטבע" low={low('currency')}>
        {select('currency', currencyOptions.map((c) => ({ value: c.code, label: c.label })))}
      </Field>
    </div>
  )
}
