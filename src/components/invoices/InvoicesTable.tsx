'use client'

import { useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Trash2, FileText, Loader2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
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

type SortField = 'date' | 'total' | 'vendor' | 'source' | null

function SortIcon({ field, sortConfig }: { field: SortField; sortConfig: { field: SortField; dir: string } }) {
  if (sortConfig.field !== field) return <ChevronsUpDown className="w-3 h-3 opacity-40 inline mr-1" />
  return sortConfig.dir === 'asc' ? (
    <ChevronUp className="w-3 h-3 inline mr-1 text-blue-300" />
  ) : (
    <ChevronDown className="w-3 h-3 inline mr-1 text-blue-300" />
  )
}

interface InvoicesTableProps {
  invoices: Invoice[]
  onRefresh: () => void
  isLoading: boolean
  categories?: string[]
}

export default function InvoicesTable({
  invoices = [],
  onRefresh,
  isLoading,
  categories = [],
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

  const parseDate = (str: string | null) => {
    if (!str) return new Date(0)
    if (str.includes('/')) {
      const [d, m, y] = str.split('/')
      return new Date(`${y}-${m}-${d}`)
    }
    return new Date(str)
  }

  const sortedInvoices = useMemo(() => {
    if (!sortConfig.field) return invoices
    return [...invoices].sort((a, b) => {
      if (sortConfig.field === 'date') {
        const va = parseDate(a.date).getTime()
        const vb = parseDate(b.date).getTime()
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

  const allSelected = sortedInvoices.length > 0 && selected.size === sortedInvoices.length
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(sortedInvoices.map((inv) => inv.id)))
  }

  const handleDelete = async () => {
    if (!deleteInvoice) return
    await InvoiceEntity.delete(deleteInvoice.id)
    setDeleteInvoice(null)
    onRefresh()
  }

  const formatCurrency = (val: number | null) => {
    if (val == null) return '—'
    return `₪${Number(val).toLocaleString('he-IL', { minimumFractionDigits: 2 })}`
  }

  const thClass =
    'text-right text-xs font-semibold text-white cursor-pointer select-none hover:text-blue-300 transition-colors'

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl shadow-xl overflow-hidden" dir="rtl">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-5 pb-4 border-b border-white/10 bg-white/5"
        style={{ justifyContent: 'flex-end', direction: 'ltr' }}
      >
        {selected.size > 0 && (
          <button
            onClick={() => setConfirmBulkDelete(true)}
            className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            מחק {selected.size} נבחרים
          </button>
        )}
        <h2 className="text-lg font-bold text-white" style={{ direction: 'rtl' }}>
          טבלת חשבוניות
        </h2>
        <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-2 rounded-xl">
          <FileText className="w-4 h-4 text-white" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-white/40">
          <Loader2 className="w-10 h-10 mb-3 animate-spin" />
          <p className="text-sm">טוען...</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-white/40">
          <FileText className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">אין חשבוניות עדיין</p>
          <p className="text-xs mt-1">העלה קובץ PDF כדי להתחיל</p>
        </div>
      ) : (
        <>
          {/* Mobile: Cards */}
          <div className="sm:hidden divide-y divide-white/10" dir="rtl">
            {sortedInvoices.map((inv) => (
              <div
                key={inv.id}
                className={`p-4 transition-colors ${selected.has(inv.id) ? 'bg-blue-500/10' : 'hover:bg-white/5'}`}
                onClick={() => setEditInvoice(inv)}
              >
                <div className="flex items-start justify-between gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(inv.id)}
                    onChange={() => toggleSelect(inv.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 accent-blue-400 cursor-pointer mt-1 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{inv.vendor || '—'}</p>
                    <p className="text-xs text-blue-300 font-mono mt-0.5">{inv.doc_number || '—'}</p>
                    {inv.description && (
                      <p className="text-xs text-white/50 mt-0.5 truncate">{inv.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs text-white/40">{inv.date || '—'}</span>
                      {inv.payment_method && (
                        <span className="text-xs text-white/40">{inv.payment_method}</span>
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
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="text-sm font-bold text-emerald-400">
                      {formatCurrency(inv.total)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-white/30 hover:text-red-400 hover:bg-red-500/10"
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
                <TableRow className="bg-white/5 border-white/10" dir="rtl">
                  <TableHead className="w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="w-4 h-4 accent-blue-400 cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort('date')}>
                    תאריך <SortIcon field="date" sortConfig={sortConfig} />
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort('vendor')}>
                    ספק <SortIcon field="vendor" sortConfig={sortConfig} />
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold text-white">
                    מס&apos; חשבונית
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold text-white">
                    תיאור
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort('total')}>
                    סה&quot;כ <SortIcon field="total" sortConfig={sortConfig} />
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold text-white">
                    תשלום
                  </TableHead>
                  <TableHead className={thClass} onClick={() => toggleSort('source')}>
                    מקור <SortIcon field="source" sortConfig={sortConfig} />
                  </TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedInvoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className={`hover:bg-white/10 transition-colors group border-white/5 cursor-pointer ${selected.has(inv.id) ? 'bg-blue-500/10' : ''}`}
                    onDoubleClick={() => setEditInvoice(inv)}
                  >
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(inv.id)}
                        onChange={() => toggleSelect(inv.id)}
                        className="w-4 h-4 accent-blue-400 cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm text-white/50 whitespace-nowrap">
                      {inv.date || '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-white">
                      {inv.vendor || '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm text-blue-300 font-mono">
                      {inv.doc_number || '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm text-white/60 max-w-[200px] truncate">
                      {inv.description || '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold text-emerald-400">
                      {formatCurrency(inv.total)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-white/60">
                      {inv.payment_method || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.source === 'gmail' ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                          מייל
                        </span>
                      ) : inv.source === 'whatsapp' ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-0.5 rounded-full">
                          וואטסאפ
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs bg-white/10 text-white/40 border border-white/10 px-2 py-0.5 rounded-full">
                          ידני
                        </span>
                      )}
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
