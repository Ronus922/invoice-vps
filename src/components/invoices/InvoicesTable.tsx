'use client'

import { useState, useMemo, type ReactNode } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Trash2,
  FileText,
  Loader2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Send,
} from 'lucide-react'

const ACCOUNTANT_REASONS_HE: Record<string, string> = {
  needs_review: 'נדרשת בדיקת סכומים — לא נשלח',
  no_accountant_email: 'לא הוגדר מייל רואה חשבון',
  gmail_not_connected: 'Gmail לא מחובר',
}

function accountantStatusLabel(inv: Invoice): { sent: boolean; tooltip: string } {
  if (inv.sent_to_accountant_at) {
    const when = new Date(inv.sent_to_accountant_at).toLocaleString('he-IL')
    return { sent: true, tooltip: `נשלח לרו"ח ב-${when}` }
  }
  const err = inv.accountant_send_error
  if (!err) return { sent: false, tooltip: 'טרם נשלח לרו"ח' }
  return { sent: false, tooltip: ACCOUNTANT_REASONS_HE[err] || err }
}
import EditInvoiceDialog from './EditInvoiceDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { InvoiceEntity, type Invoice } from '@/lib/entities'
import { parseInvoiceDate } from '@/lib/date-utils'
import { formatCurrency } from '@/lib/format'

type SortField = 'date' | 'total' | 'vendor' | 'source' | null

function SortIcon({ field, sortConfig }: { field: SortField; sortConfig: { field: SortField; dir: string } }) {
  if (sortConfig.field !== field) return <ChevronsUpDown className="w-4 h-4 opacity-40 inline mr-1" />
  return sortConfig.dir === 'asc' ? (
    <ChevronUp className="w-4 h-4 inline mr-1 text-blue-300" />
  ) : (
    <ChevronDown className="w-4 h-4 inline mr-1 text-blue-300" />
  )
}

const PAGE_SIZE = 25

interface InvoicesTableProps {
  invoices: Invoice[]
  totalCount?: number
  onRefresh: () => void
  isLoading: boolean
  categories?: string[]
  toolbar?: ReactNode
}

export default function InvoicesTable({
  invoices = [],
  totalCount,
  onRefresh,
  isLoading,
  categories = [],
  toolbar,
}: InvoicesTableProps) {
  const [deleteInvoice, setDeleteInvoice] = useState<Invoice | null>(null)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [sortConfig, setSortConfig] = useState<{ field: SortField; dir: string }>({
    field: null,
    dir: 'desc',
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

  const retrySend = async (inv: Invoice) => {
    if (retryingIds.has(inv.id) || !inv.file_url) return
    setRetryingIds((prev) => new Set(prev).add(inv.id))
    try {
      await fetch('/api/send-to-accountant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: inv.id,
          file_url: inv.file_url,
          vendor: inv.vendor || '',
          date: inv.date || '',
        }),
      })
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev)
        next.delete(inv.id)
        return next
      })
      onRefresh()
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    await Promise.all([...selected].map((id) => InvoiceEntity.delete(id)))
    setSelected(new Set())
    setConfirmBulkDelete(false)
    setBulkDeleting(false)
    onRefresh()
  }

  const toggleSort = (field: SortField) => {
    setSortConfig((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { field, dir: 'desc' }
    )
  }

  const sortedInvoices = useMemo(() => {
    if (!sortConfig.field) return invoices
    return [...invoices].sort((a, b) => {
      if (sortConfig.field === 'date') {
        const va = parseInvoiceDate(a.date)?.getTime() ?? 0
        const vb = parseInvoiceDate(b.date)?.getTime() ?? 0
        return sortConfig.dir === 'asc' ? va - vb : vb - va
      }
      if (sortConfig.field === 'total') {
        const va = a.total ?? 0
        const vb = b.total ?? 0
        return sortConfig.dir === 'asc' ? va - vb : vb - va
      }
      if (sortConfig.field === 'vendor') {
        const va = a.vendor || ''
        const vb = b.vendor || ''
        return sortConfig.dir === 'asc' ? va.localeCompare(vb, 'he') : vb.localeCompare(va, 'he')
      }
      if (sortConfig.field === 'source') {
        const va = a.source || ''
        const vb = b.source || ''
        return sortConfig.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return 0
    })
  }, [invoices, sortConfig])

  // Client-side pagination over the sorted list. Page is clamped so filter
  // changes that shrink the list never leave us on a non-existent page.
  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageInvoices = useMemo(
    () => sortedInvoices.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sortedInvoices, currentPage]
  )

  const pageNumbers = useMemo(() => {
    const windowSize = 5
    let start = Math.max(1, currentPage - 2)
    const end = Math.min(totalPages, start + windowSize - 1)
    start = Math.max(1, end - windowSize + 1)
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }, [currentPage, totalPages])

  const allSelected = pageInvoices.length > 0 && pageInvoices.every((inv) => selected.has(inv.id))
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(pageInvoices.map((inv) => inv.id)))
  }

  const handleDelete = async () => {
    if (!deleteInvoice) return
    await InvoiceEntity.delete(deleteInvoice.id)
    setDeleteInvoice(null)
    onRefresh()
  }

  const thClass =
    'text-right cursor-pointer select-none transition-colors hover:!text-[var(--text2)]'

  return (
    <div
      className="overflow-hidden rounded-[18px]"
      style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
      dir="rtl"
    >
      {/* Toolbar: filters + export actions (+ bulk delete when relevant) */}
      {(toolbar || selected.size > 0) && (
        <div
          className="flex flex-wrap items-center gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {toolbar}
          {selected.size > 0 && (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="flex h-10 items-center gap-1.5 rounded-[10px] px-3.5 text-[13.5px] font-medium transition-colors"
              style={{
                background: 'rgba(248, 113, 113, 0.12)',
                border: '1px solid rgba(248, 113, 113, 0.35)',
                color: 'rgb(252, 165, 165)',
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              מחק {selected.size} נבחרים
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--muted)' }}>
          <Loader2 className="w-10 h-10 mb-3 animate-spin" />
          <p className="text-sm">טוען...</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--muted)' }}>
          <FileText className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">אין חשבוניות עדיין</p>
          <p className="text-xs mt-1">העלה קובץ PDF כדי להתחיל</p>
        </div>
      ) : (
        <>
          {/* Mobile: Cards */}
          <div className="sm:hidden" dir="rtl">
            {pageInvoices.map((inv) => (
              <div
                key={inv.id}
                className="p-4 transition-colors"
                style={{
                  borderBottom: '1px solid var(--border-soft)',
                  background: selected.has(inv.id) ? 'var(--accent-soft)' : undefined,
                }}
                onClick={() => setEditInvoice(inv)}
              >
                <div className="flex items-start justify-between gap-2">
                  <label
                    className="flex items-center justify-center min-w-[44px] min-h-[44px] flex-shrink-0 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(inv.id)}
                      onChange={() => toggleSelect(inv.id)}
                      className="w-4 h-4 accent-[#2dd4bf] cursor-pointer"
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-white/70">ספק</p>
                    <p className="font-semibold text-white text-sm truncate">{inv.vendor || '—'}</p>

                    <p className="text-[13px] font-bold text-white/70 mt-1.5">מספר חשבונית</p>
                    <p className="text-xs text-blue-300 font-mono mt-0.5">{inv.doc_number || '—'}</p>
                    {inv.description && (
                      <>
                        <p className="text-[13px] font-bold text-white/70 mt-1.5">תיאור</p>
                        <p className="text-xs text-white/50 mt-0.5 truncate">{inv.description}</p>
                      </>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[13px] font-bold text-white/70">תאריך:</span>
                      <span className="text-xs text-white/40">{inv.date || '—'}</span>
                      {inv.payment_method && (
                        <>
                          <span className="text-[13px] font-bold text-white/70">תשלום:</span>
                          <span className="text-xs text-white/40">{inv.payment_method}</span>
                        </>
                      )}
                      {inv.source === 'gmail' && (
                        <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
                          מייל
                        </span>
                      )}
                      {inv.source === 'whatsapp' && (
                        <span className="text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-1.5 py-0.5 rounded-full">
                          וואטסאפ
                        </span>
                      )}
                      {(() => {
                        const status = accountantStatusLabel(inv)
                        const isRetrying = retryingIds.has(inv.id)
                        if (status.sent) {
                          return (
                            <span title={status.tooltip} aria-label={status.tooltip} className="inline-flex items-center gap-1 text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">רו&quot;ח</span>
                            </span>
                          )
                        }
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              retrySend(inv)
                            }}
                            disabled={isRetrying || !inv.file_url}
                            title={isRetrying ? 'שולח...' : `${status.tooltip} — לחץ לשליחה`}
                            className="inline-flex items-center gap-1 text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-2 py-1 rounded-full disabled:opacity-50"
                          >
                            {isRetrying ? (
                              <Loader2 className="w-3.5 h-3.5 text-blue-300 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5 text-red-400" />
                            )}
                            <span className="text-red-400">{isRetrying ? 'שולח...' : 'שלח לרו"ח'}</span>
                          </button>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="text-[13px] font-bold text-white/70">סה&quot;כ</span>
                    <span
                      className={`text-sm font-bold inline-flex items-center gap-1 ${inv.needs_review ? 'text-red-400' : 'text-emerald-400'}`}
                      title={
                        inv.needs_review
                          ? inv.validation_error || 'נדרשת בדיקת סכומים'
                          : inv.vat_derived
                            ? 'מע״מ חושב מהסה״כ'
                            : undefined
                      }
                    >
                      {inv.needs_review && <AlertTriangle className="w-3.5 h-3.5" />}
                      {formatCurrency(inv.total, inv.currency)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-white/30 hover:text-red-400 hover:bg-red-500/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteInvoice(inv)
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden sm:block overflow-x-auto" dir="rtl">
            <Table>
              <TableHeader>
                <TableRow
                  className="[&>th]:!py-3 [&>th]:text-[12.5px] [&>th]:!font-semibold [&>th]:text-[var(--muted-mid)]"
                  style={{ background: 'var(--hover)', borderBottom: '1px solid var(--border)' }}
                  dir="rtl"
                >
                  <TableHead className="w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="w-4 h-4 accent-[#2dd4bf] cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort('date')}>
                    תאריך <SortIcon field="date" sortConfig={sortConfig} />
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort('vendor')}>
                    ספק <SortIcon field="vendor" sortConfig={sortConfig} />
                  </TableHead>
                  <TableHead className="text-right">מס&apos; חשבונית</TableHead>
                  <TableHead className="text-right">תיאור</TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort('total')}>
                    סה&quot;כ <SortIcon field="total" sortConfig={sortConfig} />
                  </TableHead>
                  <TableHead className="text-right">תשלום</TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort('source')}>
                    מקור <SortIcon field="source" sortConfig={sortConfig} />
                  </TableHead>
                  <TableHead className="w-20 text-center">רו&quot;ח</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageInvoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="group cursor-pointer transition-colors hover:bg-[var(--hover)]"
                    style={{
                      borderBottom: '1px solid var(--border-soft)',
                      background: selected.has(inv.id) ? 'var(--accent-soft)' : undefined,
                    }}
                    onDoubleClick={() => setEditInvoice(inv)}
                  >
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(inv.id)}
                        onChange={() => toggleSelect(inv.id)}
                        className="w-4 h-4 accent-[#2dd4bf] cursor-pointer"
                      />
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap text-right text-[13.5px]"
                      style={{ color: 'var(--text3)' }}
                      dir="ltr"
                    >
                      {inv.date || '—'}
                    </TableCell>
                    <TableCell className="text-right text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>
                      {inv.vendor || '—'}
                    </TableCell>
                    <TableCell className="text-right text-[12.5px]" style={{ color: 'var(--link)' }} dir="ltr">
                      {inv.doc_number || '—'}
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate text-right text-[13.5px]"
                      style={{ color: 'var(--text2)' }}
                    >
                      {inv.description || '—'}
                    </TableCell>
                    <TableCell
                      className="text-right text-[13.5px] font-bold"
                      style={{ color: inv.needs_review ? 'rgb(248, 113, 113)' : 'var(--accent)' }}
                      title={
                        inv.needs_review
                          ? inv.validation_error || 'נדרשת בדיקת סכומים'
                          : inv.vat_derived
                            ? 'מע״מ חושב מהסה״כ'
                            : undefined
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        {inv.needs_review && (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        )}
                        {formatCurrency(inv.total, inv.currency)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-[12.5px]" style={{ color: 'var(--text3)' }}>
                      {inv.payment_method || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.source === 'gmail' ? (
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11.5px]"
                          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                        >
                          מייל
                        </span>
                      ) : inv.source === 'whatsapp' ? (
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11.5px]"
                          style={{ background: 'rgba(74, 222, 128, 0.12)', color: 'rgb(134, 239, 172)' }}
                        >
                          וואטסאפ
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11.5px]"
                          style={{ background: 'var(--chip-bg)', color: '#a9bde0' }}
                        >
                          ידני
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const status = accountantStatusLabel(inv)
                        const isRetrying = retryingIds.has(inv.id)
                        if (status.sent) {
                          return (
                            <span title={status.tooltip} aria-label={status.tooltip}>
                              <CheckCircle2 className="inline h-5 w-5" style={{ color: 'var(--accent)' }} />
                            </span>
                          )
                        }
                        return (
                          <button
                            type="button"
                            onClick={() => retrySend(inv)}
                            disabled={isRetrying || !inv.file_url}
                            title={isRetrying ? 'שולח...' : `${status.tooltip} — לחץ לשליחה`}
                            aria-label={isRetrying ? 'שולח לרואה חשבון' : 'שלח לרואה חשבון'}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group/send"
                          >
                            {isRetrying ? (
                              <Loader2 className="w-5 h-5 text-blue-300 animate-spin" />
                            ) : (
                              <>
                                <XCircle className="w-5 h-5 text-red-400 group-hover/send:hidden" />
                                <Send className="w-4 h-4 text-blue-300 hidden group-hover/send:inline" />
                              </>
                            )}
                          </button>
                        )
                      })()}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => setDeleteInvoice(inv)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination footer */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-[13px]"
            style={{ color: 'var(--muted-mid)' }}
          >
            <span>
              מציג {pageInvoices.length} מתוך {totalCount ?? sortedInvoices.length} חשבוניות
            </span>
            {totalPages > 1 && (
              <div className="flex gap-1.5" dir="ltr">
                <button
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  aria-label="עמוד קודם"
                  className="h-8 w-8 rounded-lg transition-colors disabled:opacity-40"
                  style={{ border: '1px solid var(--border)', color: 'var(--text3)' }}
                >
                  ‹
                </button>
                {pageNumbers.map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className="h-8 w-8 rounded-lg transition-colors"
                    style={
                      n === currentPage
                        ? { background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700 }
                        : { border: '1px solid var(--border)', color: 'var(--text3)' }
                    }
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="עמוד הבא"
                  className="h-8 w-8 rounded-lg transition-colors disabled:opacity-40"
                  style={{ border: '1px solid var(--border)', color: 'var(--text3)' }}
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {editInvoice && (
        <EditInvoiceDialog
          invoice={editInvoice}
          open={!!editInvoice}
          onClose={() => setEditInvoice(null)}
          onSaved={() => {
            setEditInvoice(null)
            onRefresh()
          }}
          categories={categories}
        />
      )}

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={confirmBulkDelete} onOpenChange={() => setConfirmBulkDelete(false)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">
              מחיקת {selected.size} חשבוניות
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              האם אתה בטוח שברצונך למחוק {selected.size} רשומות? פעולה זו אינה ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 justify-start">
            <AlertDialogCancel disabled={bulkDeleting}>ביטול</AlertDialogCancel>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
            >
              {bulkDeleting ? 'מוחק...' : `מחק ${selected.size}`}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteInvoice} onOpenChange={() => setDeleteInvoice(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">מחיקת חשבונית</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              האם אתה בטוח שברצונך למחוק את חשבונית {deleteInvoice?.doc_number} מ-
              {deleteInvoice?.vendor}?
              <br />
              פעולה זו אינה ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 justify-start">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
