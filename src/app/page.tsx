'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Tag } from 'lucide-react'
import { InvoiceEntity } from '@/lib/entities'
import StatsCards from '@/components/invoices/StatsCards'
import UploadZone from '@/components/invoices/UploadZone'
import InvoicesTable from '@/components/invoices/InvoicesTable'
import CategoryManager, { useCategories } from '@/components/invoices/CategoryManager'
import InvoiceFilters from '@/components/invoices/InvoiceFilters'
import ExportToolbar from '@/components/invoices/ExportToolbar'
import ScanGmailModal from '@/components/invoices/ScanGmailModal'
import IncompleteInvoicesAlert from '@/components/invoices/IncompleteInvoicesAlert'

export default function InvoicesPage() {
  const queryClient = useQueryClient()
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [showScanModal, setShowScanModal] = useState(false)
  const [lastDownloadedAt, setLastDownloadedAt] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('last_downloaded_at') || null
  })

  const handleDownloaded = (isoDate: string) => {
    localStorage.setItem('last_downloaded_at', isoDate)
    setLastDownloadedAt(isoDate)
  }

  const [filters, setFilters] = useState({
    vendor: '',
    dateFrom: '',
    dateTo: '',
    category: '',
  })
  const { categories, addCategory, removeCategory } = useCategories()

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const all = await InvoiceEntity.list('-created_at')
      const zeros = all.filter((inv) => inv.total === 0)
      if (zeros.length > 0) {
        await Promise.all(zeros.map((inv) => InvoiceEntity.delete(inv.id)))
        return all.filter((inv) => inv.total !== 0)
      }
      return all
    },
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
  }

  const parseDate = (str: string | null) => {
    if (!str) return null
    if (str.includes('/')) {
      const [d, m, y] = str.split('/')
      return new Date(`${y}-${m}-${d}`)
    }
    return new Date(str)
  }

  const filteredInvoices = invoices.filter((inv) => {
    if (filters.vendor && !inv.vendor?.toLowerCase().includes(filters.vendor.toLowerCase()))
      return false
    if (filters.category && inv.category !== filters.category) return false
    if (filters.dateFrom) {
      const invDate = parseDate(inv.date)
      if (!invDate || invDate < new Date(filters.dateFrom)) return false
    }
    if (filters.dateTo) {
      const invDate = parseDate(inv.date)
      if (!invDate || invDate > new Date(filters.dateTo)) return false
    }
    return true
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950" dir="rtl">
      <div className="w-full px-3 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-4 sm:space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" dir="rtl">
          <div className="text-right">
            <div className="flex items-center gap-3 justify-end mb-1">
              <div className="bg-gradient-to-br from-blue-400 to-indigo-500 p-2.5 rounded-xl shadow-lg shadow-blue-500/30">
                <span className="text-2xl">🧾</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">ניהול חשבוניות</h1>
            </div>
            <p className="text-xs sm:text-sm text-blue-300/80">
              העלה חשבוניות PDF וצפה בנתונים שחולצו אוטומטית
            </p>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setShowScanModal(true)}
              className="flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 hover:text-blue-200 text-sm font-medium px-3 py-2 rounded-xl transition-all"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <span className="hidden sm:inline">סרוק מייל</span>
            </button>
            <button
              onClick={() => setShowCategoryManager(true)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white/80 hover:text-white text-sm font-medium px-3 py-2 rounded-xl transition-all"
            >
              <Tag className="w-4 h-4" />
              <span className="hidden sm:inline">ניהול קטגוריות</span>
            </button>
          </div>
        </header>

        <StatsCards invoices={invoices} lastDownloadedAt={lastDownloadedAt} />

        <UploadZone onInvoiceExtracted={refresh} existingInvoices={invoices} />

        <InvoiceFilters filters={filters} onChange={setFilters} categories={categories} />

        <IncompleteInvoicesAlert invoices={invoices} onRefresh={refresh} categories={categories} />

        <ExportToolbar
          filteredInvoices={filteredInvoices}
          onDownloaded={handleDownloaded}
        />

        {filteredInvoices.length > 0 && (
          <div className="flex items-center justify-start">
            <span className="text-xs text-white/40">
              מציג {filteredInvoices.length} מתוך {invoices.length} חשבוניות
            </span>
          </div>
        )}

        <InvoicesTable
          invoices={filteredInvoices}
          onRefresh={refresh}
          isLoading={isLoading}
          categories={categories}
        />
      </div>

      <CategoryManager
        open={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
        categories={categories}
        onAdd={addCategory}
        onRemove={removeCategory}
      />

      {showScanModal && (
        <ScanGmailModal onClose={() => setShowScanModal(false)} onDone={refresh} />
      )}
    </div>
  )
}
