'use client'

import { useState } from 'react'
import { Plus, X, Tag, Pencil, Check, RotateCcw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

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
    if (!trimmed || categories.includes(trimmed)) return false
    saveCategories([...categories, trimmed])
    return true
  }

  const removeCategory = (name: string) => {
    saveCategories(categories.filter((c) => c !== name))
  }

  return { categories, addCategory, removeCategory }
}

interface CategoryManagerProps {
  open: boolean
  onClose: () => void
  categories: string[]
  onAdd: (name: string) => boolean
  onRemove: (name: string) => void
}

export default function CategoryManager({
  open,
  onClose,
  categories,
  onAdd,
  onRemove,
}: CategoryManagerProps) {
  const [newCat, setNewCat] = useState('')
  const [error, setError] = useState('')
  const [editingCat, setEditingCat] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleEdit = (cat: string) => {
    setEditingCat(cat)
    setEditValue(cat)
  }

  const handleEditSave = (oldCat: string) => {
    const trimmed = editValue.trim()
    if (!trimmed || trimmed === oldCat) {
      setEditingCat(null)
      return
    }
    onRemove(oldCat)
    onAdd(trimmed)
    setEditingCat(null)
  }

  const handleAdd = () => {
    if (!newCat.trim()) return
    const ok = onAdd(newCat)
    if (ok) {
      setNewCat('')
      setError('')
    } else {
      setError('קטגוריה זו כבר קיימת')
    }
  }

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY)
    DEFAULT_CATEGORIES.forEach((cat) => {
      if (!categories.includes(cat)) onAdd(cat)
    })
  }

  const isCustom = (cat: string) => !DEFAULT_CATEGORIES.includes(cat)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2.5 justify-end">
            <span>ניהול קטגוריות</span>
            <div className="bg-blue-500/20 p-1.5 rounded-lg">
              <Tag className="w-4 h-4 text-blue-400" />
            </div>
          </DialogTitle>
          <DialogDescription className="text-right">
            {categories.length} קטגוריות פעילות
          </DialogDescription>
        </DialogHeader>

        {/* Add new */}
        <div className="flex gap-2" dir="rtl">
          <div className="relative flex-1">
            <input
              value={newCat}
              onChange={(e) => {
                setNewCat(e.target.value)
                setError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="הוסף קטגוריה חדשה..."
              className="w-full bg-white/5 border border-white/15 text-white placeholder:text-white/30 text-sm rounded-xl px-3 py-2.5 text-right focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/20 transition-all"
              dir="rtl"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!newCat.trim()}
            className="flex-shrink-0 bg-blue-500 hover:bg-blue-600 disabled:bg-white/10 disabled:text-white/20 text-white rounded-xl px-3 py-2.5 transition-all"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {error && (
          <p className="text-xs text-amber-400 text-right -mt-1">{error}</p>
        )}

        {/* List */}
        <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1" dir="rtl">
          {categories.map((cat) => (
            <div
              key={cat}
              className="group flex items-center gap-2 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-transparent hover:border-white/10 rounded-xl transition-all"
              dir="rtl"
            >
              {editingCat === cat ? (
                <>
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditSave(cat)
                      if (e.key === 'Escape') setEditingCat(null)
                    }}
                    className="flex-1 bg-white/10 border border-blue-400/30 text-white text-sm rounded-lg px-2.5 py-1 text-right focus:outline-none focus:border-blue-400/50"
                    dir="rtl"
                    autoFocus
                  />
                  <button
                    onClick={() => handleEditSave(cat)}
                    className="text-emerald-400 hover:text-emerald-300 p-1 rounded-lg hover:bg-emerald-500/10 transition-all"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingCat(null)}
                    className="text-white/30 hover:text-white/60 p-1 rounded-lg hover:bg-white/5 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-white/80">{cat}</span>
                  {isCustom(cat) && (
                    <span className="text-[10px] text-blue-400/60 bg-blue-500/10 px-1.5 py-0.5 rounded-md">
                      מותאם
                    </span>
                  )}
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEdit(cat)}
                      className="text-white/30 hover:text-blue-400 p-1 rounded-lg hover:bg-blue-500/10 transition-all"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onRemove(cat)}
                      className="text-white/30 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-all"
          >
            סגור
          </button>
          <button
            onClick={handleReset}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 text-xs transition-all"
          >
            <RotateCcw className="w-3 h-3" />
            איפוס
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
