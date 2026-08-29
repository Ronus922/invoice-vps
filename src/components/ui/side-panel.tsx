'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// THE canonical drawer for every "large" modal in the app (invoice edit,
// backup, categories, folder watch, gmail scan, accountant settings): opens
// from the LEFT edge, full height, dark-glass chrome. Small yes/no
// confirmations stay the existing centered AlertDialog — this is not a
// second shell for those, only a replacement for the old centered
// popups on substantial content.
const DURATION = 280

interface SidePanelProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon?: LucideIcon
  widthClassName?: string
  bodyClassName?: string
  footer?: React.ReactNode
  children: React.ReactNode
}

export function SidePanel({
  open,
  onClose,
  title,
  subtitle,
  icon: IconCmp,
  widthClassName,
  bodyClassName,
  footer,
  children,
}: SidePanelProps) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  // Keep the latest onClose in a ref so the effects below don't need it as a
  // dependency — owners pass a fresh closure every render, and re-running the
  // keydown/focus effect on every parent render would fight typing in a field.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    setPortalRoot(document.body)
  }, [])

  // Stay mounted for one transition duration after `open` flips false, so the
  // slide-out plays instead of the panel just vanishing.
  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    const timer = window.setTimeout(() => setMounted(false), DURATION)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!mounted) return
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        } else if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
          e.preventDefault()
          last.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 0)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      const returnTarget = returnFocusRef.current
      if (returnTarget?.isConnected) returnTarget.focus()
    }
  }, [mounted])

  if (!portalRoot || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50" dir="rtl">
      <div
        className={cn(
          'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        style={{ transitionDuration: `${DURATION}ms` }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 left-0 flex h-full flex-col overflow-hidden bg-[#0e1f3d] border-l border-[rgba(126,152,210,0.18)] shadow-[0_32px_80px_rgba(4,10,26,0.65)] outline-none transition-transform ease-out',
          widthClassName ?? 'w-full sm:w-[460px]',
          visible ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ transitionDuration: `${DURATION}ms` }}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-[rgba(126,152,210,0.14)] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {IconCmp && (
              <div className="w-12 h-12 flex-shrink-0 rounded-[14px] bg-[rgba(45,212,191,0.12)] border border-[rgba(45,212,191,0.25)] flex items-center justify-center">
                <IconCmp className="w-5 h-5 text-[#2dd4bf]" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-[19px] font-extrabold text-[#f4f7fd] truncate">{title}</h2>
              {subtitle && <p className="text-[13.5px] text-[#8fb0e8] truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={cn('flex-1 min-h-0 overflow-y-auto', bodyClassName ?? 'px-6 py-5')}>
          {children}
        </div>

        {footer && (
          <div className="flex items-center gap-2 px-6 py-4 border-t border-[rgba(126,152,210,0.14)] flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    portalRoot
  )
}
