'use client'

import { Search, X } from 'lucide-react'
import DatePicker from '@/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Filters {
  vendor: string
  dateFrom: string
  dateTo: string
  category: string
}

interface InvoiceFiltersProps {
  filters: Filters
  onChange: (filters: Filters) => void
  categories?: string[]
}

// Compact toolbar variant — lives inside the invoices-table card header,
// matching the mockup (search / category / from / to on one wrapping row).
export default function InvoiceFilters({
  filters,
  onChange,
  categories = [],
}: InvoiceFiltersProps) {
  const update = (key: keyof Filters, value: string) => onChange({ ...filters, [key]: value })

  const hasActiveFilters = filters.vendor || filters.dateFrom || filters.dateTo || filters.category

  const clearAll = () => onChange({ vendor: '', dateFrom: '', dateTo: '', category: '' })

  return (
    <>
      <div
        className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] px-3.5 sm:min-w-[220px]"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--muted)' }} />
        <input
          value={filters.vendor}
          onChange={(e) => update('vendor', e.target.value)}
          placeholder="חיפוש ספק, מס' חשבונית או תיאור..."
          className="w-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text)' }}
        />
      </div>

      <Select
        value={filters.category}
        onValueChange={(v) => update('category', v === '__all__' ? '' : v)}
      >
        <SelectTrigger
          className="h-10 w-auto min-w-[130px] rounded-[10px] text-[13.5px]"
          style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text2)' }}
        >
          <SelectValue placeholder="כל הקטגוריות" />
        </SelectTrigger>
        <SelectContent dir="rtl">
          <SelectItem value="__all__" className="text-right">
            כל הקטגוריות
          </SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat} value={cat} className="text-right">
              {cat}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="w-[calc(50%-6px)] sm:w-[150px]">
        <DatePicker value={filters.dateFrom} onChange={(v) => update('dateFrom', v)} placeholder="מתאריך" />
      </div>
      <div className="w-[calc(50%-6px)] sm:w-[150px]">
        <DatePicker value={filters.dateTo} onChange={(v) => update('dateTo', v)} placeholder="עד תאריך" />
      </div>

      {hasActiveFilters && (
        <button
          onClick={clearAll}
          className="flex h-10 items-center gap-1.5 rounded-[10px] px-2.5 text-xs transition-colors"
          style={{ color: 'var(--muted-mid)' }}
        >
          <X className="h-3.5 w-3.5" />
          נקה
        </button>
      )}
    </>
  )
}
