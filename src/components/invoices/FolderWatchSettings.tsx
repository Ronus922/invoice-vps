'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FolderUp,
  FolderOpen,
  Play,
  Unplug,
  Info,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  isFolderWatchSupported,
  loadFolderHandle,
  saveFolderHandle,
  clearFolderHandle,
  ensurePermission,
  runFolderScan,
  type FolderScanProgress,
  type FolderScanResult,
} from '@/lib/folder-watch'
import { InvoiceEntity } from '@/lib/entities'
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

interface FolderWatchSettingsProps {
  onClose: () => void
  onScanned: () => void
}

interface ScanStateResponse {
  lastScanAt: string | null
  lastScanCount: number
  lastError: string | null
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'טרם בוצעה'
  const d = new Date(iso)
  return d.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function FolderWatchSettings({ onClose, onScanned }: FolderWatchSettingsProps) {
  const supported = isFolderWatchSupported()
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [loadingHandle, setLoadingHandle] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<FolderScanProgress | null>(null)
  const [lastResult, setLastResult] = useState<FolderScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const scanInFlight = useRef(false)

  const { data: state, refetch: refetchState } = useQuery<ScanStateResponse>({
    queryKey: ['folder-watch-state'],
    queryFn: async () => {
      const res = await fetch('/api/folder-watch/scan-state', { cache: 'no-store' })
      if (!res.ok) return { lastScanAt: null, lastScanCount: 0, lastError: null }
      return res.json()
    },
  })

  useEffect(() => {
    let cancelled = false
    if (!supported) {
      setLoadingHandle(false)
      return
    }
    loadFolderHandle()
      .then((h) => {
        if (!cancelled) setHandle(h)
      })
      .finally(() => {
        if (!cancelled) setLoadingHandle(false)
      })
    return () => {
      cancelled = true
    }
  }, [supported])

  const handlePickFolder = useCallback(async () => {
    setError(null)
    try {
      const picked = await window.showDirectoryPicker({ mode: 'readwrite' })
      const granted = await ensurePermission(picked, 'readwrite')
      if (!granted) {
        setError('הרשאת כתיבה לתיקייה לא אושרה')
        return
      }
      await saveFolderHandle(picked)
      setHandle(picked)
    } catch (err) {
      // User cancelled the picker — ignore that case
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'בחירת התיקייה נכשלה')
    }
  }, [])

  const handleDisconnect = useCallback(async () => {
    await clearFolderHandle()
    setHandle(null)
    setLastResult(null)
    setProgress(null)
  }, [])

  const handleScan = useCallback(async () => {
    if (!handle || scanInFlight.current) return
    setError(null)
    scanInFlight.current = true
    setScanning(true)
    setLastResult(null)
    setProgress({ total: 0, processed: 0, created: 0, duplicates: 0, errors: 0, currentFile: null })

    try {
      const invoices = await InvoiceEntity.list('-created_at')
      const result = await runFolderScan(handle, invoices, (snap) => setProgress({ ...snap }))
      if (!result) {
        setError('סריקה אחרת כבר פועלת (בלשונית או חלון אחר) — נסה שוב בעוד רגע')
        return
      }
      setLastResult(result)
      onScanned()
      refetchState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הסריקה נכשלה')
    } finally {
      scanInFlight.current = false
      setScanning(false)
    }
  }, [handle, onScanned, refetchState])

  const hasFolder = !!handle

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[460px] bg-[#0e1f3d] border border-[rgba(126,152,210,0.22)] rounded-[20px] shadow-[0_32px_80px_rgba(4,10,26,0.65)] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-[26px] pt-6 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex-shrink-0 rounded-[14px] bg-[rgba(45,212,191,0.12)] border border-[rgba(45,212,191,0.25)] flex items-center justify-center">
              <FolderUp className="w-5 h-5 text-[#2dd4bf]" />
            </div>
            <div>
              <h3 className="text-[19px] font-extrabold text-[#f4f7fd]">סריקת תיקייה</h3>
              <p className="text-[13.5px] text-[#8fb0e8]">שמור תיקייה במחשב ועבד חשבוניות אוטומטית</p>
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

        {/* Body */}
        <div className="px-[26px] pb-6 pt-5">
          {!supported ? (
            <div className="rounded-[13px] border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-200 leading-relaxed">
                  <p className="font-medium mb-1">תכונה זו דורשת Chrome או Edge על מחשב</p>
                  <p className="text-xs text-amber-200/80">
                    Safari, Firefox ומכשירי iOS לא תומכים בגישה ישירה לתיקיות מהדפדפן.
                    בקש מהמערכת לסרוק את המייל אוטומטית — זה רץ בצד השרת ולא דורש דפדפן.
                  </p>
                </div>
              </div>
            </div>
          ) : loadingHandle ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-[#8fb0e8] animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Folder-tracked card */}
              <div className="rounded-[13px] bg-[rgba(126,152,210,0.06)] border border-[rgba(126,152,210,0.14)] px-4 py-3.5 flex items-center gap-3">
                <span
                  className="w-[9px] h-[9px] rounded-full flex-shrink-0"
                  style={{
                    background: hasFolder ? '#2dd4bf' : '#5d729c',
                    boxShadow: hasFolder ? '0 0 8px rgba(45,212,191,0.7)' : 'none',
                  }}
                />
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-[15px] font-bold text-[#f4f7fd] truncate">
                    {hasFolder ? handle.name : 'לא נבחרה תיקייה'}
                  </p>
                  <p className="text-[12.5px] text-[#7e97c4] mt-0.5">
                    {hasFolder ? 'תיקייה במעקב' : 'בחר תיקייה כדי להתחיל'}
                  </p>
                </div>
                <div className="w-[38px] h-[38px] flex-shrink-0 rounded-[11px] bg-[rgba(126,152,210,0.1)] flex items-center justify-center">
                  <FolderOpen className="w-[18px] h-[18px] text-[#8fb0e8]" />
                </div>
              </div>

              {!hasFolder && (
                <button
                  onClick={handlePickFolder}
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-[12px] bg-[#2dd4bf] hover:brightness-110 text-[#0b1830] text-sm font-bold transition-[filter]"
                >
                  <FolderOpen className="w-4 h-4" />
                  בחר תיקייה
                </button>
              )}

              {/* Data cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[13px] bg-[rgba(126,152,210,0.06)] border border-[rgba(126,152,210,0.14)] px-4 py-3">
                  <p className="text-xs text-[#7e97c4]">סריקה אחרונה</p>
                  <p className="text-[15px] font-bold text-[#f4f7fd] mt-1" dir="ltr">
                    {formatDateTime(state?.lastScanAt ?? null)}
                  </p>
                </div>
                <div className="rounded-[13px] bg-[rgba(126,152,210,0.06)] border border-[rgba(126,152,210,0.14)] px-4 py-3">
                  <p className="text-xs text-[#7e97c4]">חשבוניות בסריקה אחרונה</p>
                  <p className="text-[17px] font-extrabold text-[#2dd4bf] mt-1" dir="ltr">
                    {state?.lastScanCount ?? 0}
                  </p>
                </div>
              </div>

              {/* Progress (during scan) */}
              {scanning && progress && (
                <div className="rounded-[13px] bg-[rgba(45,212,191,0.05)] border border-[rgba(45,212,191,0.18)] px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-4 h-4 rounded-full animate-spin"
                      style={{
                        border: '2px solid rgba(45,212,191,0.25)',
                        borderTopColor: '#2dd4bf',
                        animationDuration: '0.9s',
                      }}
                    />
                    <p className="text-sm font-medium text-[#f4f7fd]">
                      מעבד {progress.processed} / {progress.total}
                    </p>
                  </div>
                  {progress.currentFile && (
                    <p className="text-xs text-[#7e97c4] truncate mt-1.5" dir="ltr">
                      {progress.currentFile}
                    </p>
                  )}
                  {progress.total > 0 && (
                    <div className="w-full h-[7px] rounded-full bg-[rgba(126,152,210,0.15)] overflow-hidden mt-2.5">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${Math.round((progress.processed / Math.max(progress.total, 1)) * 100)}%`,
                          background: 'linear-gradient(90deg, #2dd4bf, #5eead4)',
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Last result summary */}
              {!scanning && lastResult && (
                <div className="rounded-[13px] bg-[rgba(45,212,191,0.05)] border border-[rgba(45,212,191,0.18)] px-4 py-3.5 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#2dd4bf] shrink-0 mt-0.5" />
                  <div className="text-sm text-[#f4f7fd]">
                    <p className="font-medium">
                      הסריקה הסתיימה — {lastResult.created} נוצרו
                      {lastResult.duplicates > 0 ? ` · ${lastResult.duplicates} כפולות` : ''}
                      {lastResult.errors > 0 ? ` · ${lastResult.errors} שגיאות` : ''}
                    </p>
                    {lastResult.total === 0 && (
                      <p className="text-xs text-[#8fb0e8] mt-1">לא נמצאו קבצים חדשים</p>
                    )}
                  </div>
                </div>
              )}

              {/* Last persistent error */}
              {state?.lastError && !scanning && (
                <div className="rounded-[13px] bg-[rgba(244,113,113,0.08)] border border-[rgba(244,113,113,0.3)] px-4 py-3.5 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300 break-words">{state.lastError}</p>
                </div>
              )}

              {/* Error from current run */}
              {error && (
                <div className="rounded-[13px] bg-[rgba(244,113,113,0.08)] border border-[rgba(244,113,113,0.3)] px-4 py-3.5 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300 break-words">{error}</p>
                </div>
              )}

              {/* Detailed errors from last result */}
              {!scanning && lastResult && lastResult.errorMessages.length > 0 && (
                <div className="rounded-[13px] border border-amber-500/30 bg-amber-500/10 px-4 py-3.5">
                  <p className="text-xs text-amber-200 font-medium mb-2">פרטי שגיאות:</p>
                  <ul className="text-xs text-amber-200/80 space-y-1 list-disc pr-4">
                    {lastResult.errorMessages.slice(0, 5).map((msg, idx) => (
                      <li key={idx} className="break-words">{msg}</li>
                    ))}
                    {lastResult.errorMessages.length > 5 && (
                      <li>ועוד {lastResult.errorMessages.length - 5}...</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2.5">
                <button
                  onClick={handleScan}
                  disabled={scanning || !hasFolder}
                  className="flex-1 h-12 flex items-center justify-center gap-2 rounded-[12px] bg-[#2dd4bf] hover:brightness-110 text-[#0b1830] text-sm font-bold transition-[filter] disabled:bg-[rgba(45,212,191,0.35)] disabled:cursor-not-allowed shadow-[0_6px_16px_rgba(45,212,191,0.25)]"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      סורק...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      סרוק כעת
                    </>
                  )}
                </button>
                <button
                  onClick={handlePickFolder}
                  disabled={scanning}
                  title="בחר תיקייה אחרת"
                  aria-label="בחר תיקייה אחרת"
                  className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-[12px] border border-[rgba(126,152,210,0.25)] text-[#c9d8f2] hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={scanning || !hasFolder}
                  title="נתק תיקייה"
                  aria-label="נתק תיקייה"
                  className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-[12px] border border-[rgba(126,152,210,0.25)] text-[#c9d8f2] hover:bg-[rgba(244,113,113,0.12)] hover:border-[rgba(244,113,113,0.35)] hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Unplug className="w-4 h-4" />
                </button>
              </div>

              {/* Info box */}
              <div className="rounded-[11px] bg-[rgba(45,212,191,0.05)] border border-[rgba(45,212,191,0.14)] px-4 py-3 flex items-start gap-2">
                <span className="w-[18px] h-[18px] flex-shrink-0 rounded-full border border-[#2dd4bf] flex items-center justify-center mt-0.5">
                  <Info className="w-3 h-3 text-[#2dd4bf]" />
                </span>
                <p className="text-[12.5px] text-[#8fb0e8] leading-[1.5]">
                  סריקה אוטומטית רצה כשהדפדפן פתוח. סריקת המייל בצד השרת רצה גם בלי דפדפן.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">ניתוק תיקייה</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              לנתק את &quot;{handle?.name}&quot;? הקבצים שכבר עובדו יישארו כפי שהם — רק המעקב
              האוטומטי אחרי התיקייה יופסק.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 justify-start">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect}>נתק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
