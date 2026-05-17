'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { currencySymbol } from '@/lib/format'
import { Loader2, Paperclip, ExternalLink, X, Upload, AlertTriangle } from 'lucide-react'
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

function buildFields(currency: string) {
  const sym = currencySymbol(currency)
  return [
    { key: 'date', label: 'תאריך', type: 'text', placeholder: 'DD/MM/YYYY' },
    { key: 'vendor', label: 'שם הספק', type: 'text', placeholder: '' },
    { key: 'doc_number', label: 'מספר חשבונית', type: 'text', placeholder: '' },
    { key: 'description', label: 'תיאור', type: 'text', placeholder: '' },
    { key: 'pretax', label: `לפני מע"מ ${sym}`, type: 'number', placeholder: '' },
    { key: 'vat', label: `מע"מ ${sym}`, type: 'number', placeholder: '' },
    { key: 'total', label: `סה"כ ${sym}`, type: 'number', placeholder: '' },
  ]
}

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (invoice) setForm({ ...invoice })
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

      return next
    })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fileUrl = await uploadFile(file)
      handleChange('file_url', fileUrl)
      handleChange('file_name', file.name)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await InvoiceEntity.update(invoice.id, {
        date: (form.date as string) || null,
        vendor: (form.vendor as string) || '',
        doc_number: (form.doc_number as string) || '',
        description: (form.description as string) || null,
        pretax: parseFloat(String(form.pretax)) || 0,
        vat: parseFloat(String(form.vat)) || 0,
        total: parseFloat(String(form.total)) || 0,
        currency: (form.currency as string) || 'ILS',
        payment_method: (form.payment_method as string) || null,
        category: (form.category as string) || null,
        file_url: (form.file_url as string) || null,
        file_name: (form.file_name as string) || null,
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">עריכת חשבונית</DialogTitle>
        </DialogHeader>

        {invoice.needs_review && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-right">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-300">
              <p className="font-semibold">חשבונית סומנה לבדיקה</p>
              <p className="text-xs text-red-300/80 mt-0.5">
                {invoice.validation_error || 'אי-התאמה בין לפני מע״מ + מע״מ לסה״כ. ודא את הסכומים מול האסמכתא לפני שמירה.'}
              </p>
              <p className="text-xs text-red-300/60 mt-0.5">
                החשבונית לא נשלחה לרו״ח עד תיקון.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          {buildFields((form.currency as string) || 'ILS').map((f) => (
            <div key={f.key} className={f.key === 'description' ? 'sm:col-span-2' : ''}>
              <Label className="text-xs text-gray-500 mb-1 block text-right">{f.label}</Label>
              <Input
                type={f.type}
                value={String(form[f.key] ?? '')}
                onChange={(e) => handleChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="text-right"
                dir="rtl"
              />
            </div>
          ))}

          <div>
            <Label className="text-xs text-gray-500 mb-1 block text-right">מטבע</Label>
            <Select
              value={(form.currency as string) || 'ILS'}
              onValueChange={(v) => handleChange('currency', v)}
            >
              <SelectTrigger className="text-right" dir="rtl">
                <SelectValue placeholder="בחר..." />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-1 block text-right">אמצעי תשלום</Label>
            <Select
              value={(form.payment_method as string) || ''}
              onValueChange={(v) => handleChange('payment_method', v)}
            >
              <SelectTrigger className="text-right" dir="rtl">
                <SelectValue placeholder="בחר..." />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-1 block text-right">קטגוריה</Label>
            <Select
              value={(form.category as string) || ''}
              onValueChange={(v) => handleChange('category', v)}
            >
              <SelectTrigger className="text-right" dir="rtl">
                <SelectValue placeholder="בחר..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* File attachment */}
          <div className="sm:col-span-2">
            <Label className="text-xs text-gray-500 mb-1 block text-right">
              אסמכתא (PDF / תמונה)
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            {form.file_url ? (
              <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-blue-700 truncate">
                  <Paperclip className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">
                    {(form.file_name as string) || 'קובץ מצורף'}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={form.file_url as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-700"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => {
                      handleChange('file_url', '')
                      handleChange('file_name', '')
                    }}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
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
        </div>

        <DialogFooter className="flex gap-2 justify-start">
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
