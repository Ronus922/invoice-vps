'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FolderCog,
  FolderOpen,
  Play,
  Unplug,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-gradient-to-b from-slate-800 to-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-violet-500/30 to-purple-600/20 border border-violet-400/30 p-2.5 rounded-xl">
              <FolderCog className="w-5 h-5 text-violet-300" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">סריקת תיקייה</h3>
              <p className="text-xs text-white/40">שמור תיקייה במחשב ועבד חשבוניות אוטומטית</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {!supported ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
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
            <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Folder picker */}
            {!handle ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-white/70 mb-3 leading-relaxed">
                  בחר תיקייה במחשב. כל קובץ PDF/תמונה שייכנס לתיקייה יעובד אוטומטית
                  ויוסר מהתיקייה אחרי העלאה מוצלחת.
                </p>
                <button
                  onClick={handlePickFolder}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-300 rounded-xl font-medium text-sm transition-all min-h-[44px]"
                >
                  <FolderOpen className="w-4 h-4" />
                  בחר תיקייה
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <FolderOpen className="w-4 h-4 text-violet-300 shrink-0" />
                    <p className="text-sm font-medium text-white truncate">{handle.name}</p>
                  </div>
                  <p className="text-[11px] text-white/40">תיקייה במעקב</p>
                </div>

                {/* Status */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-white/40">סריקה אחרונה</p>
                    <p className="text-[11px] font-medium text-white/80 mt-0.5">
                      {formatDateTime(state?.lastScanAt ?? null)}
                    </p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-white/40">חשבוניות בסריקה אחרונה</p>
                    <p className="text-xs font-bold text-emerald-400 mt-0.5">
                      {state?.lastScanCount ?? 0}
                    </p>
                  </div>
                </div>

                {/* Progress (during scan) */}
                {scanning && progress && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Loader2 className="w-4 h-4 text-blue-300 animate-spin" />
                      <p className="text-sm text-blue-200 font-medium">
                        מעבד {progress.processed} / {progress.total}
                      </p>
                    </div>
                    {progress.currentFile && (
                      <p className="text-[11px] text-blue-200/70 truncate">{progress.currentFile}</p>
                    )}
                    {progress.total > 0 && (
                      <div className="w-full bg-white/10 rounded-full h-1 mt-2 overflow-hidden">
                        <div
                          className="h-full bg-blue-400 transition-all"
                          style={{
                            width: `${Math.round((progress.processed / Math.max(progress.total, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Last result summary */}
                {!scanning && lastResult && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                      <div className="text-sm text-emerald-100">
                        <p className="font-medium">
                          הסריקה הסתיימה — {lastResult.created} נוצרו
                          {lastResult.duplicates > 0 ? ` · ${lastResult.duplicates} כפולות` : ''}
                          {lastResult.errors > 0 ? ` · ${lastResult.errors} שגיאות` : ''}
                        </p>
                        {lastResult.total === 0 && (
                          <p className="text-xs text-emerald-100/70 mt-1">לא נמצאו קבצים חדשים</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Last persistent error */}
                {state?.lastError && !scanning && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-300 break-words">{state.lastError}</p>
                  </div>
                )}

                {/* Error from current run */}
                {error && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-300 break-words">{error}</p>
                  </div>
                )}

                {/* Detailed errors from last result */}
                {!scanning && lastResult && lastResult.errorMessages.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-[11px] text-amber-200 font-medium mb-2">פרטי שגיאות:</p>
                    <ul className="text-[11px] text-amber-200/80 space-y-1 list-disc pr-4">
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
                <div className="flex gap-2">
                  <button
                    onClick={handleScan}
                    disabled={scanning}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-300 rounded-xl font-medium text-sm transition-all disabled:opacity-50 min-h-[44px]"
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
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 rounded-xl font-medium text-sm transition-all disabled:opacity-50 min-w-[44px] min-h-[44px]"
                    title="בחר תיקייה אחרת"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={scanning}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/50 hover:text-red-300 rounded-xl font-medium text-sm transition-all disabled:opacity-50 min-w-[44px] min-h-[44px]"
                    title="ניתוק"
                  >
                    <Unplug className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-[11px] text-white/30 text-center leading-relaxed">
                  סריקה אוטומטית רצה כשהדפדפן פתוח. סריקת המייל בצד השרת רצה גם בלי דפדפן.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
