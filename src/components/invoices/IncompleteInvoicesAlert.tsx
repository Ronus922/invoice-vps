'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import EditInvoiceDialog from './EditInvoiceDialog'
import { InvoiceEntity, type Invoice } from '@/lib/entities'
import { NON_INVOICE_REVIEW_MESSAGE } from '@/lib/doc-type'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const CRITICAL_FIELDS: { key: keyof Invoice; label: string }[] = [
  { key: 'vendor', label: 'ספק' },
  { key: 'total', label: 'סכום' },
  { key: 'doc_number', label: 'מספר חשבונית' },
  { key: 'date', label: 'תאריך' },
]

function looksLikeInvoice(inv: Invoice) {
  const score = [
    !!inv.doc_number,
    inv.total != null && inv.total !== 0,
    !!inv.vendor,
    !!inv.date,
  ].filter(Boolean).length
  return score >= 2
}

function getMissingFields(inv: Invoice) {
  return CRITICAL_FIELDS.filter((f) => !inv[f.key] && inv[f.key] !== 0).map((f) => f.label)
}

interface IncompleteInvoicesAlertProps {
  invoices: Invoice[]
  onRefresh: () => void
  categories?: string[]
}

export default function IncompleteInvoicesAlert({
  invoices = [],
  onRefresh,
  categories = [],
}: IncompleteInvoicesAlertProps) {
  const [expanded, setExpanded] = useState(true)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const incomplete = invoices.filter(
    (inv) =>
      inv.needs_review || (looksLikeInvoice(inv) && getMissingFields(inv).length > 0)
  )
  const allSelected = incomplete.length > 0 && selected.size === incomplete.length

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(incomplete.map((inv) => inv.id)))
    }
  }

  const handleDelete = async () => {
    if (!deletingInvoice) return
    await InvoiceEntity.delete(deletingInvoice.id)
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(deletingInvoice.id)
      return next
    })
    setDeletingInvoice(null)
    onRefresh()
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    await Promise.all([...selected].map((id) => InvoiceEntity.delete(id)))
    setSelected(new Set())
    setConfirmBulkDelete(false)
    setBulkDeleting(false)
    onRefresh()
  }

  if (incomplete.length === 0) return null

  return (
    <>
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl overflow-hidden shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2.5 flex-1"
          >
            <div className="bg-amber-500/20 p-1.5 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <span className="text-amber-300 font-semibold text-sm">
              {incomplete.length} חשבוניות עם מידע חסר -- נדרשת השלמה ידנית
            </span>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-amber-400/60" />
            ) : (
              <ChevronDown className="w-4 h-4 text-amber-400/60" />
            )}
          </button>

          {selected.size > 0 && (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-all mr-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              מחק {selected.size} נבחרים
            </button>
          )}
        </div>

        {/* List */}
        {expanded && (
          <div className="border-t border-amber-500/20">
            {/* Select all row */}
            <div className="flex items-center gap-3 px-5 py-2 bg-amber-500/5 border-b border-amber-500/10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="w-4 h-4 accent-amber-400 cursor-pointer"
              />
              <span className="text-xs text-amber-400/70">בחר הכל</span>
            </div>

            <div className="divide-y divide-amber-500/10">
              {incomplete.map((inv) => {
                const missing = getMissingFields(inv)
                const isSelected = selected.has(inv.id)
                const reviewIssue = inv.needs_review
                  ? inv.validation_error || 'נדרשת בדיקת סכומים'
                  : null
                const issueLine =
                  reviewIssue ||
                  (missing.length > 0 ? `חסר: ${missing.join(', ')}` : null)
                return (
                  <div
                    key={inv.id}
                    className={`flex items-center justify-between px-5 py-3 transition-colors ${isSelected ? 'bg-amber-500/10' : 'hover:bg-amber-500/5'}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(inv.id)}
                        className="w-4 h-4 accent-amber-400 cursor-pointer flex-shrink-0"
                      />
                      <div className="text-right min-w-0">
                        <p className="text-sm text-white/80 font-medium truncate">
                          {inv.vendor || inv.doc_number || 'חשבונית ללא שם'}
                        </p>
                        {issueLine && (
                          <p
                            className={`text-xs mt-0.5 ${reviewIssue ? 'text-red-300' : 'text-amber-400/80'}`}
                          >
                            {issueLine}
                          </p>
                        )}
                      </div>
                      {reviewIssue &&
                        (inv.validation_error === NON_INVOICE_REVIEW_MESSAGE ? (
                          <span className="flex-shrink-0 text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                            לא חשבונית
                          </span>
                        ) : (
                          <span className="flex-shrink-0 text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">
                            סכומים
                          </span>
                        ))}
                      {inv.source === 'gmail' && (
                        <span className="flex-shrink-0 text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                          מייל
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 mr-2">
                      <button
                        onClick={() => setEditingInvoice(inv)}
                        className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-medium px-3 py-2 rounded-lg transition-all min-h-[44px]"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">השלם</span>
                      </button>
                      <button
                        onClick={() => setDeletingInvoice(inv)}
                        className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-medium px-3 py-2 rounded-lg transition-all min-h-[44px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">מחק</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {editingInvoice && (
        <EditInvoiceDialog
          invoice={editingInvoice}
          open={!!editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onSaved={() => {
            setEditingInvoice(null)
            onRefresh()
          }}
          categories={categories}
        />
      )}

      {/* Single delete */}
      <AlertDialog open={!!deletingInvoice} onOpenChange={() => setDeletingInvoice(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">מחיקת חשבונית</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              האם אתה בטוח שברצונך למחוק את &quot;
              {deletingInvoice?.vendor || deletingInvoice?.doc_number || 'ללא שם'}&quot;? פעולה זו
              אינה ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 justify-start">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <button
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
            >
              מחק
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete */}
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
    </>
  )
}
