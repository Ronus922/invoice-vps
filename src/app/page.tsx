'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Tag, LogOut, Mail, FolderCog, HardDrive } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { InvoiceEntity } from '@/lib/entities'
import { createClient } from '@/lib/supabase/client'
import { parseInvoiceDate } from '@/lib/date-utils'
import {
  isFolderWatchSupported,
  loadFolderHandle,
  runFolderScan,
} from '@/lib/folder-watch'
import StatsCards from '@/components/invoices/StatsCards'
import UploadZone from '@/components/invoices/UploadZone'
import InvoicesTable from '@/components/invoices/InvoicesTable'
import CategoryManager, { useCategories } from '@/components/invoices/CategoryManager'
import InvoiceFilters from '@/components/invoices/InvoiceFilters'
import ExportToolbar from '@/components/invoices/ExportToolbar'
import ScanGmailModal from '@/components/invoices/ScanGmailModal'
import IncompleteInvoicesAlert from '@/components/invoices/IncompleteInvoicesAlert'
import UnsentAccountantBanner from '@/components/invoices/UnsentAccountantBanner'
import InstallBanner from '@/components/invoices/InstallBanner'
import AccountantSettings from '@/components/invoices/AccountantSettings'
import FolderWatchSettings from '@/components/invoices/FolderWatchSettings'
import DriveBackupDialog from '@/components/invoices/DriveBackupDialog'

interface ScanStatePayload {
  lastEmailScanAt: string | null
  lastFolderScanAt: string | null
}

export default function InvoicesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [showScanModal, setShowScanModal] = useState(false)
  const [showAccountantSettings, setShowAccountantSettings] = useState(false)
  const [showFolderWatch, setShowFolderWatch] = useState(false)
  const [showDriveBackup, setShowDriveBackup] = useState(false)

  const [filters, setFilters] = useState({
    vendor: '',
    dateFrom: '',
    dateTo: '',
    category: '',
  })
  const { categories, addCategory, removeCategory } = useCategories()

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => InvoiceEntity.list('-created_at'),
  })

  const { data: scanState } = useQuery<ScanStatePayload>({
    queryKey: ['scan-state'],
    queryFn: async () => {
      const res = await fetch('/api/scan-state', { cache: 'no-store' })
      if (!res.ok) return { lastEmailScanAt: null, lastFolderScanAt: null }
      return res.json()
    },
    refetchInterval: 60_000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    queryClient.invalidateQueries({ queryKey: ['scan-state'] })
  }

  // Realtime: auto-refresh when invoices change on any device
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('invoices-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices' },
        () => refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scan watched folder while the page is open. Silent if permission
  // is not granted — re-grant requires the user to click in the dialog.
  const lastFolderScanAttempt = useRef<number>(0)
  useEffect(() => {
    if (!isFolderWatchSupported()) return

    const TWELVE_HOURS = 12 * 60 * 60 * 1000

    const attempt = async () => {
      try {
        const handle = await loadFolderHandle()
        if (!handle) return
        const perm = await handle.queryPermission({ mode: 'readwrite' })
        if (perm !== 'granted') return
        const now = Date.now()
        if (now - lastFolderScanAttempt.current < TWELVE_HOURS) return
        lastFolderScanAttempt.current = now

        const list = await InvoiceEntity.list('-created_at')
        const result = await runFolderScan(handle, list)
        if (result.created > 0) {
          refresh()
        } else {
          queryClient.invalidateQueries({ queryKey: ['scan-state'] })
        }
      } catch {
        /* silent — user will see errors when they open the dialog */
      }
    }

    attempt()
    const id = setInterval(attempt, 60 * 60 * 1000) // probe hourly
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredInvoices = invoices.filter((inv) => {
    if (filters.vendor && !inv.vendor?.toLowerCase().includes(filters.vendor.toLowerCase()))
      return false
    if (filters.category && inv.category !== filters.category) return false
    if (filters.dateFrom) {
      const invDate = parseInvoiceDate(inv.date)
      if (!invDate || invDate < new Date(filters.dateFrom)) return false
    }
    if (filters.dateTo) {
      const invDate = parseInvoiceDate(inv.date)
      if (!invDate || invDate > new Date(filters.dateTo)) return false
    }
    return true
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 overflow-x-hidden" dir="rtl">
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
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              onClick={() => setShowScanModal(true)}
              title="סרוק מייל"
              className="flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 hover:text-blue-200 text-sm font-medium px-3 py-2 rounded-xl transition-all min-w-[44px] min-h-[44px] justify-center"
            >
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">סרוק מייל</span>
            </button>
            <button
              onClick={() => setShowFolderWatch(true)}
              title="סריקת תיקייה"
              className="flex items-center gap-2 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-300 hover:text-violet-200 text-sm font-medium px-3 py-2 rounded-xl transition-all min-w-[44px] min-h-[44px] justify-center"
            >
              <FolderCog className="w-4 h-4" />
              <span className="hidden sm:inline">סריקת תיקייה</span>
            </button>
            <button
              onClick={() => setShowAccountantSettings(true)}
              title="רואה חשבון"
              className="flex items-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 text-sm font-medium px-3 py-2 rounded-xl transition-all min-w-[44px] min-h-[44px] justify-center"
            >
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">רואה חשבון</span>
            </button>
            <button
              onClick={() => setShowDriveBackup(true)}
              title="גיבוי לדרייב"
              className="flex items-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-sm font-medium px-3 py-2 rounded-xl transition-all min-w-[44px] min-h-[44px] justify-center"
            >
              <HardDrive className="w-4 h-4" />
              <span className="hidden sm:inline">גיבוי לדרייב</span>
            </button>
            <button
              onClick={() => setShowCategoryManager(true)}
              title="ניהול קטגוריות"
              className="flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white/80 hover:text-white text-sm font-medium px-3 py-2 rounded-xl transition-all min-w-[44px] min-h-[44px] justify-center"
            >
              <Tag className="w-4 h-4" />
              <span className="hidden sm:inline">ניהול קטגוריות</span>
            </button>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' })
                router.push('/login')
              }}
              className="flex items-center gap-2 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/50 hover:text-red-300 text-sm font-medium px-3 py-2 rounded-xl transition-all min-w-[44px] min-h-[44px] justify-center"
              title="התנתק"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <StatsCards
          invoices={invoices}
          lastEmailScanAt={scanState?.lastEmailScanAt ?? null}
          lastFolderScanAt={scanState?.lastFolderScanAt ?? null}
        />

        <UploadZone onInvoiceExtracted={refresh} existingInvoices={invoices} />

        <InvoiceFilters filters={filters} onChange={setFilters} categories={categories} />

        <IncompleteInvoicesAlert invoices={invoices} onRefresh={refresh} categories={categories} />

        <UnsentAccountantBanner invoices={invoices} onRefresh={refresh} />

        <ExportToolbar filteredInvoices={filteredInvoices} />

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

      {showAccountantSettings && (
        <AccountantSettings onClose={() => setShowAccountantSettings(false)} />
      )}

      {showFolderWatch && (
        <FolderWatchSettings
          onClose={() => setShowFolderWatch(false)}
          onScanned={refresh}
        />
      )}

      {showDriveBackup && (
        <DriveBackupDialog onClose={() => setShowDriveBackup(false)} />
      )}

      <InstallBanner />
    </div>
  )
}
