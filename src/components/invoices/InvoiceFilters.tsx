'use client'

import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
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

export default function InvoiceFilters({
  filters,
  onChange,
  categories = [],
}: InvoiceFiltersProps) {
  const update = (key: keyof Filters, value: string) => onChange({ ...filters, [key]: value })

  const hasActiveFilters = filters.vendor || filters.dateFrom || filters.dateTo || filters.category

  const clearAll = () => onChange({ vendor: '', dateFrom: '', dateTo: '', category: '' })

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-4 shadow-xl" dir="rtl">
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 items-end">
        {/* Vendor search */}
        <div className="col-span-2 sm:flex-1 sm:min-w-[180px]">
          <label className="block text-xs text-white/50 mb-1.5">חיפוש ספק</label>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <Input
              value={filters.vendor}
              onChange={(e) => update('vendor', e.target.value)}
              placeholder="שם ספק..."
              className="bg-white/10 border-white/15 text-white placeholder:text-white/30 pr-9 focus:border-blue-400/50"
            />
          </div>
        </div>

        {/* Date From */}
        <div className="sm:min-w-[170px]">
          <label className="block text-xs text-white/50 mb-1.5">מתאריך</label>
          <DatePicker
            value={filters.dateFrom}
            onChange={(v) => update('dateFrom', v)}
            placeholder="בחר תאריך..."
          />
        </div>

        {/* Date To */}
        <div className="sm:min-w-[170px]">
          <label className="block text-xs text-white/50 mb-1.5">עד תאריך</label>
          <DatePicker
            value={filters.dateTo}
            onChange={(v) => update('dateTo', v)}
            placeholder="בחר תאריך..."
          />
        </div>

        {/* Category */}
        <div className="col-span-2 sm:min-w-[160px]">
          <label className="block text-xs text-white/50 mb-1.5">קטגוריה</label>
          <Select
            value={filters.category}
            onValueChange={(v) => update('category', v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="bg-white/10 border-white/15 text-white/80 focus:border-blue-400/50">
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
        </div>

        {/* Clear */}
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors pb-1"
          >
            <X className="w-3.5 h-3.5" />
            נקה סינון
          </button>
        )}
      </div>
    </div>
  )
}
