'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  FileText,
  Loader2,
  AlertCircle,
  Upload,
  X,
  Check,
  Clock,
  Camera,
  FolderOpen,
} from 'lucide-react'
import { InvoiceEntity, type Invoice } from '@/lib/entities'
import { uploadFile } from '@/lib/upload'

interface QueueItem {
  file: File
  name: string
  status: 'pending' | 'processing' | 'done' | 'error' | 'duplicate'
  message: string
}

interface UploadZoneProps {
  onInvoiceExtracted: () => void
  existingInvoices?: Invoice[]
}

export default function UploadZone({ onInvoiceExtracted, existingInvoices = [] }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const existingRef = useRef(existingInvoices)
  const isRunningRef = useRef(false)
  existingRef.current = existingInvoices

  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
  }, [])

  const processItems = useCallback(
    async (items: QueueItem[]) => {
      if (isRunningRef.current) return
      isRunningRef.current = true
      setIsRunning(true)

      const pending = items.filter((item) => item.status === 'pending')

      for (const item of pending) {
        setQueue((prev) => {
          const idx = prev.findIndex(
            (q) => q === item || (q.name === item.name && q.status === 'pending')
          )
          if (idx === -1) return prev
          const next = [...prev]
          next[idx] = { ...next[idx], status: 'processing' }
          return next
        })

        try {
          const fileUrl = await uploadFile(item.file)

          const res = await fetch('/api/extract-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_url: fileUrl }),
          })

          if (!res.ok) {
            const errData = await res.json()
            setQueue((prev) =>
              prev.map((q) =>
                q === item || (q.name === item.name && q.status === 'processing')
                  ? { ...q, status: 'error', message: 'שגיאה בחילוץ: ' + (errData.error || 'unknown') }
                  : q
              )
            )
            continue
          }

          const extracted = await res.json()

          const isDuplicate = existingRef.current.some(
            (inv) => inv.doc_number === extracted.doc_number && inv.vendor === extracted.vendor
          )
          if (isDuplicate) {
            setQueue((prev) =>
              prev.map((q) =>
                q === item || (q.name === item.name && q.status === 'processing')
                  ? { ...q, status: 'duplicate', message: 'כבר קיימת במערכת' }
                  : q
              )
            )
            continue
          }

          await InvoiceEntity.create({
            ...extracted,
            file_url: fileUrl,
            file_name: item.file.name,
            source: 'manual',
          })
          onInvoiceExtracted()
          setQueue((prev) =>
            prev.map((q) =>
              q === item || (q.name === item.name && q.status === 'processing')
                ? { ...q, status: 'done', message: extracted.vendor || '' }
                : q
            )
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : 'שגיאה לא ידועה'
          setQueue((prev) =>
            prev.map((q) =>
              q === item || (q.name === item.name && q.status === 'processing')
                ? { ...q, status: 'error', message }
                : q
            )
          )
        }
      }

      isRunningRef.current = false
      setIsRunning(false)
    },
    [onInvoiceExtracted]
  )

  const addFilesToQueue = useCallback(
    (files: FileList) => {
      const valid = Array.from(files).filter(
        (f) => f.type.includes('pdf') || f.name.endsWith('.pdf') || f.type.startsWith('image/')
      )
      if (valid.length === 0) return

      const newEntries: QueueItem[] = valid.map((file) => {
        const alreadyExists = existingRef.current.some((inv) => inv.file_name === file.name)
        return alreadyExists
          ? { file, name: file.name, status: 'duplicate' as const, message: 'כבר קיימת במערכת' }
          : { file, name: file.name, status: 'pending' as const, message: '' }
      })

      setQueue((prev) => [...prev, ...newEntries])

      const pendingNew = newEntries.filter((e) => e.status === 'pending')
      if (pendingNew.length > 0) {
        setTimeout(() => processItems(pendingNew), 50)
      }
    },
    [processItems]
  )

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length) addFilesToQueue(e.target.files)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFilesToQueue(e.dataTransfer.files)
  }

  const removeFromQueue = (idx: number) => setQueue((prev) => prev.filter((_, i) => i !== idx))
  const clearDone = () =>
    setQueue((prev) => prev.filter((q) => q.status === 'pending' || q.status === 'processing'))

  const pendingCount = queue.filter((q) => q.status === 'pending').length
  const doneCount = queue.filter((q) => q.status === 'done').length
  const errorCount = queue.filter((q) => q.status === 'error' || q.status === 'duplicate').length

  const statusIcon = (status: QueueItem['status']) => {
    if (status === 'processing') return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
    if (status === 'done') return <Check className="w-4 h-4 text-emerald-400" />
    if (status === 'error') return <AlertCircle className="w-4 h-4 text-red-400" />
    if (status === 'duplicate') return <AlertCircle className="w-4 h-4 text-amber-400" />
    return <Clock className="w-4 h-4 text-white/30" />
  }

  const statusLabel = (item: QueueItem) => {
    if (item.status === 'processing') return <span className="text-blue-300 text-xs">מעבד...</span>
    if (item.status === 'done') return <span className="text-emerald-400 text-xs">נוסף בהצלחה</span>
    if (item.status === 'error') return <span className="text-red-400 text-xs">{item.message}</span>
    if (item.status === 'duplicate') return <span className="text-amber-400 text-xs">כפילות</span>
    return <span className="text-white/30 text-xs">ממתין</span>
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-6 shadow-xl" dir="rtl">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        multiple
        style={{ position: 'fixed', top: -9999, left: -9999, opacity: 0 }}
        onChange={handleFileSelect}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ position: 'fixed', top: -9999, left: -9999, opacity: 0 }}
        onChange={handleFileSelect}
      />

      <div
        className="flex items-center gap-2 mb-5"
        style={{ justifyContent: 'flex-end', direction: 'ltr' }}
      >
        <h2 className="text-lg font-bold text-white" style={{ direction: 'rtl' }}>
          העלאת חשבוניות
        </h2>
        <div className="bg-gradient-to-br from-pink-500 to-rose-500 p-2 rounded-xl">
          <Upload className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (isMobile) setShowMobileMenu(true)
          else fileInputRef.current?.click()
        }}
        className={`
          relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 overflow-hidden
          ${isDragging ? 'border-blue-400 bg-blue-500/20 scale-[1.01]' : 'border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10'}
        `}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 pointer-events-none" />
        <div className="flex flex-col items-center gap-3 relative z-10">
          <div
            className={`p-3 rounded-2xl border ${isRunning ? 'bg-blue-500/20 border-blue-400/30' : 'bg-white/10 border-white/20'}`}
          >
            {isRunning ? (
              <Loader2 className="w-7 h-7 text-blue-300 animate-spin" />
            ) : (
              <FileText className="w-7 h-7 text-white/70" />
            )}
          </div>
          <div className="text-right w-full">
            <p className="text-base font-semibold text-white mb-1">
              {isRunning
                ? 'מעבד חשבוניות...'
                : isMobile
                  ? 'לחץ לצילום או בחירת קובץ'
                  : 'גרור קבצי PDF לכאן או לחץ לבחירה'}
            </p>
            <p className="text-sm text-white/40">ניתן לבחור מספר קבצים בו-זמנית - מעובד ע&quot;י AI</p>
          </div>
        </div>
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-xs text-white/50">
              {pendingCount > 0 && <span>{pendingCount} ממתינים</span>}
              {doneCount > 0 && <span className="text-emerald-400">{doneCount} הושלמו</span>}
              {errorCount > 0 && <span className="text-red-400">{errorCount} שגיאות</span>}
            </div>
            {doneCount + errorCount > 0 && !isRunning && (
              <button
                onClick={clearDone}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                נקה הושלמו
              </button>
            )}
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5">
            {queue.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all
                ${
                  item.status === 'done'
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : item.status === 'error'
                      ? 'bg-red-500/10 border-red-500/20'
                      : item.status === 'duplicate'
                        ? 'bg-amber-500/10 border-amber-500/20'
                        : item.status === 'processing'
                          ? 'bg-blue-500/10 border-blue-500/20'
                          : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex-shrink-0">{statusIcon(item.status)}</div>
                <span className="flex-1 text-white/80 truncate text-xs">{item.name}</span>
                {statusLabel(item)}
                {item.status === 'pending' && (
                  <button
                    onClick={() => removeFromQueue(idx)}
                    className="text-white/20 hover:text-white/60 flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile source picker */}
      {showMobileMenu && (
        <div
          className="fixed inset-0 z-[9999] flex items-end"
          onClick={() => setShowMobileMenu(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full bg-gradient-to-b from-slate-800 to-slate-900 border-t border-white/10 rounded-t-3xl p-6 pb-10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />
            <h3 className="text-center text-white font-bold text-xl mb-8">בחר מקור</h3>
            <div className="flex justify-center gap-6 mb-6">
              <button
                className="flex flex-col items-center gap-3 flex-1 max-w-[130px]"
                onClick={() => {
                  setShowMobileMenu(false)
                  fileInputRef.current?.click()
                }}
              >
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500/30 to-blue-600/20 border border-blue-400/40 rounded-3xl flex items-center justify-center">
                  <FolderOpen className="w-9 h-9 text-blue-300" />
                </div>
                <span className="text-sm text-white/80 font-medium">גלריה וקבצים</span>
              </button>
              <button
                className="flex flex-col items-center gap-3 flex-1 max-w-[130px]"
                onClick={() => {
                  setShowMobileMenu(false)
                  cameraInputRef.current?.click()
                }}
              >
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500/30 to-pink-600/20 border border-purple-400/40 rounded-3xl flex items-center justify-center">
                  <Camera className="w-9 h-9 text-purple-300" />
                </div>
                <span className="text-sm text-white/80 font-medium">צלם חשבונית</span>
              </button>
            </div>
            <button
              onClick={() => setShowMobileMenu(false)}
              className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white/50 text-sm font-medium"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
