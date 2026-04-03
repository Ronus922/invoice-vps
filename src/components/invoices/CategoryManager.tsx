'use client'

import { useState } from 'react'
import { Plus, X, Tag, Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2 justify-end">
            <span>ניהול קטגוריות</span>
            <Tag className="w-4 h-4" />
          </DialogTitle>
        </DialogHeader>

        {/* Add new */}
        <div className="flex gap-2 mt-2" dir="rtl">
          <Input
            value={newCat}
            onChange={(e) => {
              setNewCat(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="שם קטגוריה חדשה..."
            className="text-right"
            dir="rtl"
          />
          <Button onClick={handleAdd} size="sm" className="flex-shrink-0">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {error && <p className="text-xs text-red-500 text-right">{error}</p>}

        {/* List */}
        <div className="max-h-64 overflow-y-auto space-y-1.5 mt-3">
          {categories.map((cat) => (
            <div
              key={cat}
              className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg group"
              dir="rtl"
            >
              {editingCat === cat ? (
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEditSave(cat)
                    if (e.key === 'Escape') setEditingCat(null)
                  }}
                  onBlur={() => handleEditSave(cat)}
                  className="h-7 text-sm text-right flex-1 ml-2"
                  dir="rtl"
                  autoFocus
                />
              ) : (
                <span className="text-sm text-gray-700 flex-1">{cat}</span>
              )}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => handleEdit(cat)}
                  className="text-gray-400 hover:text-blue-500 transition-colors p-0.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onRemove(cat)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <Button variant="outline" onClick={onClose} className="mt-2 w-full">
          סגור
        </Button>
      </DialogContent>
    </Dialog>
  )
}
