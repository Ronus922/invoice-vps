'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LayoutGrid,
  FileText,
  Mail,
  FolderCog,
  Tag,
  Cloud,
  Settings,
  Plus,
  Menu,
  X,
} from 'lucide-react'
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

function AppLogo({ size = 38, icon = 22 }: { size?: number; icon?: number }) {
  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: 11,
        background: 'linear-gradient(160deg, rgb(36, 20, 84) 0%, rgb(23, 12, 58) 100%)',
        boxShadow: 'rgba(120, 140, 200, 0.2) 0px 0px 0px 1px inset',
      }}
    >
      <svg width={icon} height={icon} viewBox="0 0 44 44" fill="none">
        <path
          d="M8 26 C8 17 14 11 22 11 C30 11 36 17 36 26"
          stroke="#2dd4bf"
          strokeWidth="3.6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M17 26 L22 20 L27 26"
          stroke="#2dd4bf"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  )
}

export default function InvoicesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [showScanModal, setShowScanModal] = useState(false)
  const [showAccountantSettings, setShowAccountantSettings] = useState(false)
  const [showFolderWatch, setShowFolderWatch] = useState(false)
  const [showDriveBackup, setShowDriveBackup] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')

  const [filters, setFilters] = useState({
    vendor: '',
    dateFrom: '',
    dateTo: '',
    category: '',
  })
  const { categories, addCategory, removeCategory, renameCategory } = useCategories()

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

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }: { data: { user: { email?: string } | null } }) => {
      setUserEmail(data.user?.email ?? '')
    })
  }, [])

  // Auto-scan watched folder while the page is open. Silent if permission
  // is not granted — re-grant requires the user to click in the dialog.
  // Throttle lives in localStorage — a useRef reset on every reload used to
  // re-trigger a scan per page load, overlapping the manual dialog scan.
  useEffect(() => {
    if (!isFolderWatchSupported()) return

    const TWELVE_HOURS = 12 * 60 * 60 * 1000
    const LAST_AUTO_SCAN_KEY = 'folder-watch-last-auto-scan'

    const attempt = async () => {
      try {
        const handle = await loadFolderHandle()
        if (!handle) return
        const perm = await handle.queryPermission({ mode: 'readwrite' })
        if (perm !== 'granted') return
        let last = 0
        try {
          last = Number(window.localStorage.getItem(LAST_AUTO_SCAN_KEY) || 0)
        } catch {
          /* private mode */
        }
        const now = Date.now()
        if (now - last < TWELVE_HOURS) return
        // Mark the attempt (not the success) — prevents hot retry loops.
        try {
          window.localStorage.setItem(LAST_AUTO_SCAN_KEY, String(now))
        } catch {
          /* non-fatal */
        }

        const list = await InvoiceEntity.list('-created_at')
        const result = await runFolderScan(handle, list)
        if (!result) return // another tab/scan holds the lock
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
    if (filters.vendor) {
      const q = filters.vendor.toLowerCase()
      const haystack = [inv.vendor, inv.doc_number, inv.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }
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

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const scrollToTable = () => {
    document.getElementById('invoices-table')?.scrollIntoView({ behavior: 'smooth' })
  }

  const navItems = [
    { label: 'לוח בקרה', icon: LayoutGrid, active: true, onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
    { label: 'חשבוניות', icon: FileText, onClick: scrollToTable },
    { label: 'סריקת מייל', icon: Mail, onClick: () => setShowScanModal(true) },
    { label: 'סריקת תיקייה', icon: FolderCog, onClick: () => setShowFolderWatch(true) },
    { label: 'קטגוריות', icon: Tag, onClick: () => setShowCategoryManager(true) },
    { label: 'גיבוי לדרייב', icon: Cloud, onClick: () => setShowDriveBackup(true) },
    { label: 'הגדרות', icon: Settings, onClick: () => setShowAccountantSettings(true) },
  ]

  const userInitials = (userEmail || '?').slice(0, 2)

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2.5 px-2 pb-4 pt-1">
        <AppLogo />
        <span dir="ltr" className="text-[17px] font-extrabold tracking-tight">
          InvoiceFlow
        </span>
      </div>

      {navItems.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.label}
            onClick={() => {
              setShowMobileNav(false)
              item.onClick()
            }}
            className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-right text-[14.5px] transition-colors"
            style={
              item.active
                ? { background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700 }
                : { color: 'var(--text2)', fontWeight: 500 }
            }
            onMouseEnter={(e) => {
              if (!item.active) e.currentTarget.style.background = 'var(--hover)'
            }}
            onMouseLeave={(e) => {
              if (!item.active) e.currentTarget.style.background = 'transparent'
            }}
          >
            <Icon className="w-[18px] h-[18px] shrink-0" />
            <span>{item.label}</span>
          </button>
        )
      })}

      <div className="flex-1" />

      <div
        className="flex items-center gap-2.5 rounded-xl p-3"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
      >
        <div
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
          style={{
            background: 'linear-gradient(135deg, rgb(45, 212, 191), rgb(30, 111, 143))',
            color: 'var(--on-accent)',
          }}
          dir="ltr"
        >
          {userInitials}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold" dir="ltr">
            {userEmail || '—'}
          </span>
          <button
            onClick={handleLogout}
            className="text-right text-[11.5px] transition-colors hover:underline"
            style={{ color: 'var(--muted-mid)' }}
          >
            התנתקות
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div dir="rtl" className="flex min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Sidebar — desktop */}
      <aside
        className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-2 p-4 pt-5 lg:flex"
        style={{ background: 'var(--panel)', borderLeft: '1px solid var(--border)' }}
      >
        {sidebarContent}
      </aside>

      {/* Sidebar — mobile drawer */}
      {showMobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setShowMobileNav(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <aside
            className="absolute right-0 top-0 flex h-full w-[260px] flex-col gap-2 overflow-y-auto p-4 pt-5"
            style={{ background: 'var(--panel)', borderLeft: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowMobileNav(false)}
              className="absolute left-3 top-3 rounded-lg p-2"
              style={{ color: 'var(--muted-mid)' }}
              aria-label="סגור תפריט"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <main
        className="flex min-w-0 flex-1 flex-col gap-6 px-4 pb-12 pt-6 sm:px-8 sm:pt-7"
        style={{ background: 'var(--bg-grad)' }}
      >
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMobileNav(true)}
              className="flex h-[42px] w-[42px] items-center justify-center rounded-[11px] lg:hidden"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text2)' }}
              aria-label="פתח תפריט"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex flex-col gap-1">
              <h1 className="m-0 text-[22px] font-extrabold sm:text-[26px]">ניהול חשבוניות</h1>
              <span className="text-[13px] sm:text-sm" style={{ color: 'var(--text3)' }}>
                העלה חשבוניות PDF וצפה בנתונים שחולצו אוטומטית
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => document.getElementById('invoice-upload-input')?.click()}
              className="flex h-[42px] items-center gap-2 rounded-[11px] px-4 text-sm font-bold"
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                boxShadow: 'rgba(45, 212, 191, 0.25) 0px 6px 16px',
              }}
            >
              <Plus className="h-4 w-4" />
              <span>העלאת חשבוניות</span>
            </button>
            <button
              onClick={() => setShowScanModal(true)}
              className="flex h-[42px] items-center gap-2 rounded-[11px] px-4 text-sm font-medium"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text2)' }}
            >
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">סרוק מייל</span>
            </button>
            <button
              onClick={() => setShowFolderWatch(true)}
              className="flex h-[42px] items-center gap-2 rounded-[11px] px-4 text-sm font-medium"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text2)' }}
            >
              <FolderCog className="h-4 w-4" />
              <span className="hidden sm:inline">סריקת תיקייה</span>
            </button>
          </div>
        </header>

        <StatsCards
          invoices={invoices}
          lastEmailScanAt={scanState?.lastEmailScanAt ?? null}
          lastFolderScanAt={scanState?.lastFolderScanAt ?? null}
        />

        <UploadZone onInvoiceExtracted={refresh} existingInvoices={invoices} />

        <IncompleteInvoicesAlert invoices={invoices} onRefresh={refresh} categories={categories} />

        <UnsentAccountantBanner invoices={invoices} onRefresh={refresh} />

        <div id="invoices-table">
          <InvoicesTable
            invoices={filteredInvoices}
            totalCount={invoices.length}
            onRefresh={refresh}
            isLoading={isLoading}
            categories={categories}
            toolbar={
              <>
                <InvoiceFilters filters={filters} onChange={setFilters} categories={categories} />
                <div className="hidden h-6 w-px sm:block" style={{ background: 'var(--border)' }} />
                <ExportToolbar filteredInvoices={filteredInvoices} />
              </>
            }
          />
        </div>
      </main>

      <CategoryManager
        open={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
        categories={categories}
        invoices={invoices}
        onAdd={addCategory}
        onRemove={removeCategory}
        onRename={renameCategory}
        onRenamed={refresh}
      />

      <ScanGmailModal
        open={showScanModal}
        onClose={() => setShowScanModal(false)}
        onDone={refresh}
      />

      <AccountantSettings
        open={showAccountantSettings}
        onClose={() => setShowAccountantSettings(false)}
      />

      <FolderWatchSettings
        open={showFolderWatch}
        onClose={() => setShowFolderWatch(false)}
        onScanned={refresh}
      />

      <DriveBackupDialog open={showDriveBackup} onClose={() => setShowDriveBackup(false)} />

      <InstallBanner />
    </div>
  )
}
