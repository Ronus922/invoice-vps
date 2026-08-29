'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { SidePanel } from '@/components/ui/side-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InvoiceEntity, type Invoice } from '@/lib/entities'
import { uploadFile } from '@/lib/upload'
import { fileHref } from '@/lib/file-url'
import { currencySymbol } from '@/lib/format'
import { cn } from '@/lib/utils'
import { israelVatRate } from '@/lib/vat-derivation'
import {
  Loader2,
  Paperclip,
  ExternalLink,
  X,
  Upload,
  AlertTriangle,
  FileText,
  Plus,
  Minus,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  getRememberedCategory,
  rememberVendorCategory,
} from '@/lib/vendor-category-memory'

const PAYMENT_METHODS = [
  'אשראי',
  'העברה בנקאית',
  'מזומן',
  "צ'ק",
  'הוראת קבע',
  'PayPal',
  'אחר',
]

const CURRENCIES = [
  { code: 'ILS', label: '₪ שקל (ILS)' },
  { code: 'USD', label: '$ דולר (USD)' },
  { code: 'EUR', label: '€ יורו (EUR)' },
  { code: 'GBP', label: '£ ליש"ט (GBP)' },
  { code: 'JPY', label: '¥ ין (JPY)' },
]

// Changing doc_type here is the recovery path for AI misclassification:
// the server recomputes needs_review on PATCH, so fixing a false 'other'
// back to a real type releases the row for sending to the accountant.
const DOC_TYPE_OPTIONS = [
  { code: 'invoice', label: 'חשבונית מס' },
  { code: 'receipt', label: 'קבלה' },
  { code: 'invoice_receipt', label: 'חשבונית מס-קבלה' },
  { code: 'credit_note', label: 'חשבונית זיכוי' },
  { code: 'other', label: 'מסמך אחר (לא חשבונית)' },
  { code: 'unknown', label: 'לא ידוע' },
]

const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.6
const ZOOM_STEP = 0.1

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|heic|avif)$/i

const round2 = (n: number) => Math.round(n * 100) / 100

// Parse a user-typed amount; null for empty/non-numeric input.
function parseAmount(value: unknown): number | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

const FIELD_LABEL = 'text-[12.5px] text-[#8fb0e8] mb-1 block text-right'
const FIELD_INPUT =
  'h-11 rounded-[11px] bg-[rgba(126,152,210,0.07)] border-[rgba(126,152,210,0.18)] text-right'

interface EditInvoiceDialogProps {
  invoice: Invoice
  open: boolean
  onClose: () => void
  onSaved: () => void
  categories?: string[]
}

export default function EditInvoiceDialog({
  invoice,
  open,
  onClose,
  onSaved,
  categories = [],
}: EditInvoiceDialogProps) {
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [validationMsg, setValidationMsg] = useState<string | null>(null)
  // Once the user types a VAT value themselves, stop auto-deriving it from pretax.
  const [vatTouched, setVatTouched] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [showPreviewMobile, setShowPreviewMobile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (invoice) {
      setForm({ ...invoice })
      setVatTouched(false)
      setValidationMsg(null)
      setZoom(1)
      setShowPreviewMobile(false)
    }
  }, [invoice])

  const handleChange = (key: string, value: unknown) =>
    setForm((prev) => {
      const next: Record<string, unknown> = { ...prev, [key]: value }

      if (key === 'vendor') {
        const vendorValue = String(value || '').trim()
        const currentCategory = String(next.category || '').trim()
        if (vendorValue && !currentCategory) {
          const remembered = getRememberedCategory(vendorValue)
          if (remembered) next.category = remembered
        }
      }

      if (key === 'pretax' && !vatTouched) {
        const pretaxN = parseAmount(value)
        if (pretaxN !== null) {
          next.vat = String(round2(pretaxN * israelVatRate(String(next.date || ''))))
        }
      }

      return next
    })

  const pretaxN = parseAmount(form.pretax)
  const vatN = parseAmount(form.vat)
  // Total is always pretax + vat once amounts are present; an invoice that came
  // in with only a total keeps it until the user fills the breakdown.
  const totalN =
    pretaxN !== null || vatN !== null
      ? round2((pretaxN ?? 0) + (vatN ?? 0))
      : (parseAmount(form.total) ?? 0)

  const fileUrl = (form.file_url as string) || ''
  const fileName = (form.file_name as string) || ''
  const previewHref = fileUrl ? fileHref(fileUrl) : ''
  const isImage = useMemo(() => {
    const probe = fileName || fileUrl.split('?')[0]
    return IMAGE_RE.test(probe)
  }, [fileName, fileUrl])

  const sym = currencySymbol((form.currency as string) || 'ILS')

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const uploadedUrl = await uploadFile(file)
      handleChange('file_url', uploadedUrl)
      handleChange('file_name', file.name)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const validate = (): string | null => {
    if (!String(form.date || '').trim()) return 'חסר תאריך'
    if (!String(form.vendor || '').trim()) return 'חסר שם ספק'
    if (String(form.pretax ?? '').trim() && pretaxN === null)
      return 'הסכום "לפני מע"מ" אינו מספר תקין'
    if (String(form.vat ?? '').trim() && vatN === null)
      return 'סכום המע"מ אינו מספר תקין'
    return null
  }

  const handleSave = async () => {
    const err = validate()
    setValidationMsg(err)
    if (err) return
    setSaving(true)
    try {
      await InvoiceEntity.update(invoice.id, {
        date: (form.date as string) || null,
        vendor: (form.vendor as string) || '',
        doc_number: (form.doc_number as string) || '',
        description: (form.description as string) || null,
        pretax: pretaxN ?? 0,
        vat: vatN ?? 0,
        total: totalN,
        currency: (form.currency as string) || 'ILS',
        doc_type: (form.doc_type as Invoice['doc_type']) || 'unknown',
        payment_method: (form.payment_method as string) || null,
        category: (form.category as string) || null,
        file_url: fileUrl || null,
        file_name: fileName || null,
      } as Partial<Invoice>)
      const vendor = String(form.vendor || '').trim()
      const category = String(form.category || '').trim()
      if (vendor && category) {
        rememberVendorCategory(vendor, category)
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, round2(z + ZOOM_STEP)))
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, round2(z - ZOOM_STEP)))

  const textField = (
    key: string,
    label: string,
    opts: { placeholder?: string; numeric?: boolean } = {}
  ) => (
    <div>
      <Label className={FIELD_LABEL}>{label}</Label>
      <Input
        type={opts.numeric ? 'number' : 'text'}
        inputMode={opts.numeric ? 'decimal' : undefined}
        value={String(form[key] ?? '')}
        onChange={(e) => {
          if (key === 'vat') setVatTouched(true)
          handleChange(key, e.target.value)
        }}
        placeholder={opts.placeholder}
        className={FIELD_INPUT}
        dir="rtl"
      />
    </div>
  )

  const selectField = (
    key: string,
    label: string,
    options: Array<{ value: string; label: string }>,
    fallback = ''
  ) => (
    <div>
      <Label className={FIELD_LABEL}>{label}</Label>
      <Select
        value={(form[key] as string) || fallback}
        onValueChange={(v) => handleChange(key, v)}
      >
        <SelectTrigger className={`w-full ${FIELD_INPUT}`} dir="rtl">
          <SelectValue placeholder="בחר..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const previewPanel = (
    <div
      className={`${
        showPreviewMobile ? 'flex' : 'hidden'
      } min-[900px]:flex min-[900px]:col-start-2 min-[900px]:row-start-1 flex-col min-h-0 bg-[#0a1730] border-t min-[900px]:border-t-0 min-[900px]:border-r border-[rgba(126,152,210,0.14)] max-h-[50vh] min-[900px]:max-h-none`}
    >
      {/* Preview toolbar */}
      <div className="flex items-center justify-between gap-3 px-[18px] py-3.5 border-b border-[rgba(126,152,210,0.14)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-[30px] h-[30px] flex-shrink-0 rounded-lg bg-[rgba(45,212,191,0.12)] flex items-center justify-center">
            <FileText className="w-4 h-4 text-[#2dd4bf]" />
          </div>
          <span className="text-sm text-[#c9d8f2] truncate" dir="ltr">
            {fileName || 'מסמך מצורף'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <a
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="פתיחה בחלון חדש"
            className="w-8 h-8 rounded-lg bg-[rgba(126,152,210,0.08)] hover:bg-[rgba(126,152,210,0.16)] flex items-center justify-center text-[#8fb0e8] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
            aria-label="הגדלה"
            className="w-8 h-8 rounded-lg bg-[rgba(126,152,210,0.08)] hover:bg-[rgba(126,152,210,0.16)] flex items-center justify-center text-[#8fb0e8] transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
            aria-label="הקטנה"
            className="w-8 h-8 rounded-lg bg-[rgba(126,152,210,0.08)] hover:bg-[rgba(126,152,210,0.16)] flex items-center justify-center text-[#8fb0e8] transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview body */}
      <div
        className="flex-1 min-h-0 overflow-auto p-6"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(126,152,210,0.025) 0 10px, transparent 10px 20px)',
        }}
      >
        <div
          className="mx-auto w-full max-w-[360px] rounded-md bg-white shadow-[0_16px_40px_rgba(0,0,0,0.5)] overflow-hidden transition-transform duration-200"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
        >
          {isImage ? (
            /* eslint-disable-next-line @next/next/no-img-element -- signed URL redirect, not optimizable */
            <img src={previewHref} alt={fileName || 'אסמכתא'} className="w-full block" />
          ) : (
            <iframe
              src={previewHref}
              title={fileName || 'אסמכתא'}
              className="w-full h-[480px] block border-0"
            />
          )}
        </div>
      </div>

      {/* Preview footer */}
      <div className="px-4 py-2.5 border-t border-[rgba(126,152,210,0.14)] text-center text-xs text-[#5d729c]">
        עמוד 1 מתוך 1 · {Math.round(zoom * 100)}%
      </div>
    </div>
  )

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="עריכת חשבונית"
      widthClassName={fileUrl ? 'w-full lg:w-[1060px]' : 'w-full sm:w-[460px]'}
      bodyClassName="p-0 min-[900px]:overflow-y-hidden"
      footer={
        <>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#2dd4bf] hover:bg-[#28c0ad] text-[#0b1830] font-bold shadow-[0_8px_24px_rgba(45,212,191,0.25)]"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
            שמור
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-transparent border-[rgba(126,152,210,0.25)] text-[#c9d8f2]"
          >
            ביטול
          </Button>
          {validationMsg && <p className="text-xs text-red-400 mr-2">{validationMsg}</p>}
        </>
      }
    >
      <div
        className={cn(
          'grid grid-cols-1 min-[900px]:h-full',
          fileUrl && 'min-[900px]:grid-cols-[1fr_440px]'
        )}
      >
        {/* Form panel (column 1 = physical right in RTL) */}
        <div className="min-[900px]:col-start-1 min-[900px]:row-start-1 min-[900px]:overflow-y-auto px-6 py-5 flex flex-col gap-3.5">
            {!invoice.needs_review && invoice.vat_derived && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-right">
                <p className="text-xs text-blue-300/90">
                  מע״מ לא הופיע בחשבונית — חושב אוטומטית מהסה״כ. אפשר לתקן ידנית.
                </p>
              </div>
            )}

            {invoice.needs_review && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-right">
                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-300">
                  <p className="font-semibold">חשבונית סומנה לבדיקה</p>
                  <p className="text-xs text-red-300/80 mt-0.5">
                    {invoice.validation_error ||
                      'אי-התאמה בין לפני מע״מ + מע״מ לסה״כ. ודא את הסכומים מול האסמכתא לפני שמירה.'}
                  </p>
                  <p className="text-xs text-red-300/60 mt-0.5">
                    החשבונית לא נשלחה לרו״ח עד תיקון.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3.5">
              {textField('date', 'תאריך', { placeholder: 'DD/MM/YYYY' })}
              {textField('vendor', 'שם הספק')}
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              {textField('doc_number', 'מספר חשבונית')}
              {textField('description', 'תיאור')}
            </div>

            <div className="grid grid-cols-3 gap-3.5">
              {textField('pretax', `לפני מע"מ ${sym}`, { numeric: true })}
              {textField('vat', `מע"מ ${sym}`, { numeric: true })}
              <div>
                <Label className={FIELD_LABEL}>{`סה"כ ${sym}`}</Label>
                <Input
                  readOnly
                  value={String(totalN)}
                  className={`${FIELD_INPUT} border-[rgba(45,212,191,0.35)] bg-[rgba(45,212,191,0.08)] text-[#2dd4bf] font-bold`}
                  dir="rtl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              {selectField(
                'currency',
                'מטבע',
                CURRENCIES.map((c) => ({ value: c.code, label: c.label })),
                'ILS'
              )}
              {selectField(
                'doc_type',
                'סוג מסמך',
                DOC_TYPE_OPTIONS.map((t) => ({ value: t.code, label: t.label })),
                'unknown'
              )}
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              {selectField(
                'payment_method',
                'אמצעי תשלום',
                PAYMENT_METHODS.map((m) => ({ value: m, label: m }))
              )}
              {selectField(
                'category',
                'קטגוריה',
                categories.map((c) => ({ value: c, label: c }))
              )}
            </div>

            {/* File attachment */}
            <div>
              <Label className={FIELD_LABEL}>אסמכתא (PDF / תמונה)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              {fileUrl ? (
                <div className="flex items-center justify-between gap-2 px-3 h-[46px] bg-[rgba(45,212,191,0.06)] border border-[rgba(45,212,191,0.25)] rounded-[11px]">
                  <div className="flex items-center gap-2 text-sm text-[#2dd4bf] min-w-0">
                    <Paperclip className="w-4 h-4 flex-shrink-0" />
                    <a
                      href={previewHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate hover:underline"
                      dir="ltr"
                    >
                      {fileName || 'קובץ מצורף'}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleChange('file_url', '')
                      handleChange('file_name', '')
                    }}
                    aria-label="הסרת קובץ"
                    className="flex-shrink-0 p-1 text-white/40 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-[rgba(126,152,210,0.25)] rounded-[11px] text-sm text-[#7e97c4] hover:border-[rgba(45,212,191,0.4)] hover:text-[#2dd4bf] transition-colors"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {uploading ? 'מעלה...' : 'לחץ לצירוף קובץ'}
                </button>
              )}
            </div>

            {/* Mobile-only toggle for the document preview */}
            {fileUrl && (
              <button
                type="button"
                onClick={() => setShowPreviewMobile((v) => !v)}
                className="min-[900px]:hidden flex items-center justify-center gap-2 px-4 py-2 rounded-[11px] border border-[rgba(126,152,210,0.25)] text-sm text-[#8fb0e8] hover:bg-white/5 transition-colors"
              >
                {showPreviewMobile ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                {showPreviewMobile ? 'הסתר מסמך' : 'הצג מסמך'}
              </button>
            )}
        </div>

        {/* Document preview panel (column 2 = physical left in RTL) */}
        {fileUrl && previewPanel}
      </div>
    </SidePanel>
  )
}
