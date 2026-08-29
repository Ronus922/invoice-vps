'use client'

import { useState, useMemo } from 'react'
import { Plus, X, Tag, Pencil, Check, Lock, Loader2, Info } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { InvoiceEntity, type Invoice } from '@/lib/entities'

const DEFAULT_CATEGORIES = [
  'תוכנה',
  'ענן',
  'חשמל',
  'ציוד משרדי',
  'שירותים',
  'תקשורת',
  'ביטוח',
  'שכירות',
  'משלוח',
  'שיווק',
  'הדרכה',
  'תחזוקה',
  'נסיעות',
  'אירוח',
  'אחר',
]

const STORAGE_KEY = 'invoice_categories'

function isDuplicate(categories: string[], name: string, excluding?: string): boolean {
  const norm = name.trim().toLowerCase()
  return categories.some((c) => c.toLowerCase() === norm && c !== excluding)
}

export function useCategories() {
  const [categories, setCategories] = useState<string[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_CATEGORIES
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES
    } catch {
      return DEFAULT_CATEGORIES
    }
  })

  const saveCategories = (cats: string[]) => {
    setCategories(cats)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cats))
  }

  const addCategory = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || isDuplicate(categories, trimmed)) return false
    saveCategories([...categories, trimmed])
    return true
  }

  const removeCategory = (name: string) => {
    saveCategories(categories.filter((c) => c !== name))
  }

  const renameCategory = (oldName: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || isDuplicate(categories, trimmed, oldName)) return false
    saveCategories(categories.map((c) => (c === oldName ? trimmed : c)))
    return true
  }

  return { categories, addCategory, removeCategory, renameCategory }
}

interface CategoryManagerProps {
  open: boolean
  onClose: () => void
  categories: string[]
  invoices: Invoice[]
  onAdd: (name: string) => boolean
  onRemove: (name: string) => void
  onRename: (oldName: string, newName: string) => boolean
  onRenamed: () => void
}

const ROW = 'group flex items-center gap-2.5 px-3.5 py-[9px] rounded-[11px] bg-[rgba(126,152,210,0.06)] border border-[rgba(126,152,210,0.12)] hover:border-[rgba(45,212,191,0.4)] transition-colors'

export default function CategoryManager({
  open,
  onClose,
  categories,
  invoices,
  onAdd,
  onRemove,
  onRename,
  onRenamed,
}: CategoryManagerProps) {
  const [newCat, setNewCat] = useState('')
  const [addError, setAddError] = useState('')
  const [editingCat, setEditingCat] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState('')
  const [renaming, setRenaming] = useState(false)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const inv of invoices) {
      if (!inv.category) continue
      map.set(inv.category, (map.get(inv.category) ?? 0) + 1)
    }
    return map
  }, [invoices])

  const rows = useMemo(() => {
    const list = categories.map((name) => ({ name, count: counts.get(name) ?? 0 }))
    list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'he'))
    return list
  }, [categories, counts])

  const maxCount = Math.max(1, ...rows.map((r) => r.count))

  const handleAdd = () => {
    const trimmed = newCat.trim()
    if (!trimmed) return
    const ok = onAdd(trimmed)
    if (ok) {
      setNewCat('')
      setAddError('')
    } else {
      setAddError('קטגוריה זו כבר קיימת')
    }
  }

  const startEdit = (cat: string) => {
    setEditingCat(cat)
    setEditValue(cat)
    setEditError('')
  }

  const cancelEdit = () => {
    setEditingCat(null)
    setEditError('')
  }

  const handleEditSave = async (oldCat: string) => {
    const trimmed = editValue.trim()
    if (!trimmed || trimmed === oldCat) {
      cancelEdit()
      return
    }
    const ok = onRename(oldCat, trimmed)
    if (!ok) {
      setEditError('קטגוריה זו כבר קיימת')
      return
    }
    setRenaming(true)
    try {
      // Categories are a free-text field on each invoice, not a server entity —
      // a rename has to be pushed onto every invoice that used the old name,
      // or those rows silently fall out of the picker's list.
      const affected = invoices.filter((inv) => inv.category === oldCat)
      await Promise.all(
        affected.map((inv) => InvoiceEntity.update(inv.id, { category: trimmed }))
      )
      onRenamed()
    } finally {
      setRenaming(false)
      cancelEdit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        hideClose
        dir="rtl"
        className="max-w-[460px] w-[calc(100%-2rem)] p-0 gap-0 rounded-[20px] border-[rgba(126,152,210,0.22)] shadow-[0_32px_80px_rgba(4,10,26,0.65)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-[26px] pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-[42px] h-[42px] flex-shrink-0 rounded-[13px] bg-[rgba(45,212,191,0.12)] border border-[rgba(45,212,191,0.25)] flex items-center justify-center">
              <Tag className="w-[18px] h-[18px] text-[#2dd4bf]" />
            </div>
            <div>
              <DialogTitle className="text-[18px] font-extrabold text-[#f4f7fd]">
                ניהול קטגוריות
              </DialogTitle>
              <DialogDescription className="text-[13px] text-[#8fb0e8] mt-0.5">
                {categories.length} קטגוריות · ממוינות לפי שימוש
              </DialogDescription>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-[26px] pb-6 flex flex-col gap-4">
          {/* Add new */}
          <div>
            <div className="flex gap-2">
              <input
                value={newCat}
                onChange={(e) => {
                  setNewCat(e.target.value)
                  setAddError('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="הוסף קטגוריה חדשה..."
                className="flex-1 min-w-0 h-11 rounded-[11px] bg-[rgba(126,152,210,0.07)] border border-[rgba(126,152,210,0.18)] text-[#f4f7fd] placeholder:text-[#5d729c] text-sm px-3.5 text-right focus:outline-none focus:border-[rgba(45,212,191,0.5)] transition-colors"
                dir="rtl"
              />
              <button
                onClick={handleAdd}
                disabled={!newCat.trim()}
                className="flex-shrink-0 w-11 h-11 rounded-[11px] bg-[#2dd4bf] hover:bg-[#28c0ad] disabled:bg-[rgba(45,212,191,0.35)] disabled:cursor-not-allowed text-[#0b1830] flex items-center justify-center transition-colors"
              >
                <Plus className="w-[18px] h-[18px]" />
              </button>
            </div>
            {addError && <p className="text-xs text-amber-400 mt-1.5">{addError}</p>}
          </div>

          {/* List */}
          <div className="max-h-[340px] overflow-y-auto pl-1 -mr-0 flex flex-col gap-1.5">
            {rows.map(({ name, count }) => (
              <div key={name}>
                <div className={ROW}>
                {editingCat === name ? (
                  <>
                    <input
                      value={editValue}
                      onChange={(e) => {
                        setEditValue(e.target.value)
                        setEditError('')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave(name)
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      className="flex-1 min-w-0 h-8 rounded-lg bg-[rgba(126,152,210,0.1)] border border-[rgba(45,212,191,0.5)] text-[#f4f7fd] text-sm px-2.5 text-right focus:outline-none"
                      dir="rtl"
                      autoFocus
                      disabled={renaming}
                    />
                    <button
                      onClick={() => handleEditSave(name)}
                      disabled={renaming}
                      aria-label="שמירה"
                      className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-[#2dd4bf] hover:bg-[rgba(45,212,191,0.12)] transition-colors disabled:opacity-50"
                    >
                      {renaming ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={renaming}
                      aria-label="ביטול"
                      className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-[#7e97c4] hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 min-w-0 truncate text-sm font-semibold text-[#f4f7fd]">
                      {name}
                    </span>
                    <span className="w-[90px] h-[5px] flex-shrink-0 rounded-full bg-[rgba(126,152,210,0.15)] overflow-hidden">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(count / maxCount) * 100}%`,
                          background: 'linear-gradient(90deg, #2dd4bf, #5eead4)',
                        }}
                      />
                    </span>
                    <span className="text-[12.5px] text-[#8fb0e8] flex-shrink-0 w-6 text-center" dir="ltr">
                      {count}
                    </span>
                    <button
                      onClick={() => startEdit(name)}
                      aria-label="עריכת שם"
                      className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-[#8fb0e8] hover:text-[#2dd4bf] hover:bg-[rgba(45,212,191,0.12)] transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {count === 0 ? (
                      <button
                        onClick={() => onRemove(name)}
                        aria-label="מחיקה"
                        className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-[#7e97c4] hover:text-[#f47171] hover:bg-[rgba(244,113,113,0.15)] transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span
                        className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-[#7e97c4] opacity-45 cursor-not-allowed"
                        title="לא ניתן למחוק — קיימות חשבוניות משויכות"
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </>
                )}
                </div>
                {editingCat === name && editError && (
                  <p className="text-xs text-amber-400 mt-1 px-1">{editError}</p>
                )}
              </div>
            ))}
          </div>

          {/* Info note */}
          <div className="flex items-center gap-1.5 text-xs text-[#7e97c4]">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            <span>מחיקה אפשרית רק לקטגוריה ללא חשבוניות משויכות.</span>
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            className="w-full h-11 rounded-[11px] bg-[#2dd4bf] hover:bg-[#28c0ad] text-[#0b1830] text-sm font-bold transition-colors"
          >
            סגור
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
