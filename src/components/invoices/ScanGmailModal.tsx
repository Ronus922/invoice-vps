'use client'

import { useState, useEffect } from 'react'
import {
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Search,
  Clock,
  Mail,
  FileText,
  SkipForward,
} from 'lucide-react'

interface ScanResult {
  mode: 'quick' | 'full'
  created: number
  duplicates: number
  skipped: number
  skippedAlreadyScanned: number
  errors: number
  totalChecked: number
  newChecked: number
  lastScanAt: string | null
  details?: Array<{
    status: string
    vendor?: string
    filename?: string
  }>
}

interface ScanStatus {
  lastScanAt: string | null
  totalScannedMessages: number
  totalFoundInvoices: number
  totalTrackedEmails: number
}

interface ScanGmailModalProps {
  onClose: () => void
  onDone: () => void
}

function formatDate(iso: string | null): string {
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

export default function ScanGmailModal({ onClose, onDone }: ScanGmailModalProps) {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle')
  const [mode, setMode] = useState<'quick' | 'full'>('quick')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [scanInfo, setScanInfo] = useState<ScanStatus | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)

  // Fetch scan status on mount
  useEffect(() => {
    fetch('/api/scan-gmail')
      .then((r) => r.json())
      .then((data) => setScanInfo(data))
      .catch(() => {})
      .finally(() => setLoadingInfo(false))
  }, [])

  const handleScan = async () => {
    setStatus('scanning')
    setResult(null)
    setErrorMsg('')
    try {
      const res = await fetch('/api/scan-gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxMessages: mode === 'full' ? 100 : 50, mode }),
      })
      const data = await res.json()
      if (data.status === 'error') {
        setErrorMsg(data.message || 'שגיאה לא ידועה')
        setStatus('error')
      } else {
        setResult(data)
        setStatus('done')
        if (data.created > 0) onDone()
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'שגיאת רשת')
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-slate-900 border border-white/15 rounded-2xl p-6 shadow-2xl w-full max-w-md mx-4"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">סריקת מייל לחשבוניות</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Idle state */}
        {status === 'idle' && (
          <div className="space-y-4">
            {/* Last scan KPI */}
            {loadingInfo ? (
              <div className="flex justify-center py-3">
                <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
              </div>
            ) : scanInfo ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                  <Clock className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                  <p className="text-[11px] text-white/40">סריקה אחרונה</p>
                  <p className="text-xs font-medium text-white/80 mt-0.5">
                    {formatDate(scanInfo.lastScanAt)}
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                  <Mail className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
                  <p className="text-[11px] text-white/40">מיילים שנסרקו</p>
                  <p className="text-lg font-bold text-white/80">{scanInfo.totalScannedMessages}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                  <FileText className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <p className="text-[11px] text-white/40">חשבוניות שאותרו</p>
                  <p className="text-lg font-bold text-emerald-400">{scanInfo.totalFoundInvoices}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                  <SkipForward className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                  <p className="text-[11px] text-white/40">מיילים במעקב</p>
                  <p className="text-lg font-bold text-white/80">{scanInfo.totalTrackedEmails}</p>
                </div>
              </div>
            ) : null}

            {/* Mode selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setMode('quick')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  mode === 'quick'
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'
                }`}
              >
                <Zap className="w-4 h-4" />
                סריקה מהירה
              </button>
              <button
                onClick={() => setMode('full')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  mode === 'full'
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'
                }`}
              >
                <Search className="w-4 h-4" />
                סריקה מלאה
              </button>
            </div>

            <p className="text-white/40 text-xs text-center">
              {mode === 'quick'
                ? 'סורק רק מיילים חדשים שלא נסרקו בעבר'
                : 'סורק מחדש את כל המיילים (עד 100)'}
            </p>

            <button
              onClick={handleScan}
              className={`w-full flex items-center justify-center gap-2 font-medium px-6 py-2.5 rounded-xl transition-all ${
                mode === 'quick'
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              התחל סריקה
            </button>
          </div>
        )}

        {/* Scanning state */}
        {status === 'scanning' && (
          <div className="text-center py-6">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-white font-medium mb-1">
              {mode === 'quick' ? 'סורק מיילים חדשים...' : 'סורק את כל תיבת הדואר...'}
            </p>
            <p className="text-white/40 text-sm">
              {mode === 'quick'
                ? 'מדלג על מיילים שכבר נסרקו'
                : 'סורק מחדש את כל ההיסטוריה'}
            </p>
            <div className="mt-4 w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
            </div>
          </div>
        )}

        {/* Done state */}
        {status === 'done' && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-semibold">הסריקה הושלמה</span>
              <span className="text-xs text-white/30 mr-auto">
                {result.mode === 'quick' ? 'מהירה' : 'מלאה'}
              </span>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{result.totalChecked}</p>
                <p className="text-[11px] text-white/50 mt-0.5">נבדקו בתיבה</p>
              </div>
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-indigo-400">{result.newChecked}</p>
                <p className="text-[11px] text-white/50 mt-0.5">מיילים חדשים</p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{result.created}</p>
                <p className="text-[11px] text-white/50 mt-0.5">חשבוניות נוספו</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-amber-400">{result.skippedAlreadyScanned}</p>
                <p className="text-[11px] text-white/50 mt-0.5">דולגו (כבר נסרקו)</p>
              </div>
            </div>

            {/* Extra stats row */}
            {(result.duplicates > 0 || result.errors > 0) && (
              <div className="flex gap-2">
                {result.duplicates > 0 && (
                  <div className="flex-1 bg-white/5 border border-white/10 rounded-xl p-2 text-center">
                    <p className="text-sm font-bold text-white/50">{result.duplicates}</p>
                    <p className="text-[10px] text-white/30">כפילויות</p>
                  </div>
                )}
                {result.errors > 0 && (
                  <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl p-2 text-center">
                    <p className="text-sm font-bold text-red-400">{result.errors}</p>
                    <p className="text-[10px] text-white/30">שגיאות</p>
                  </div>
                )}
              </div>
            )}

            {/* Created invoices list */}
            {result.details?.filter((d) => d.status === 'created').length ? (
              <div className="bg-white/5 rounded-xl p-3 max-h-36 overflow-y-auto">
                {result.details
                  .filter((d) => d.status === 'created')
                  .map((d, i) => (
                    <div key={i} className="flex items-center gap-2 py-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span className="text-xs text-white/70 truncate">
                        {d.vendor || d.filename}
                      </span>
                    </div>
                  ))}
              </div>
            ) : null}

            {/* No new emails message */}
            {result.newChecked === 0 && result.skippedAlreadyScanned > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                <p className="text-sm text-blue-300">
                  לא נמצאו מיילים חדשים מאז הסריקה האחרונה
                </p>
                <p className="text-[11px] text-white/30 mt-1">
                  {result.skippedAlreadyScanned} מיילים כבר נסרקו בעבר
                </p>
              </div>
            )}

            {result.created === 0 && result.newChecked > 0 && (
              <p className="text-white/50 text-sm text-center">
                לא נמצאו חשבוניות חדשות במיילים שנסרקו
              </p>
            )}

            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-all"
            >
              סגור
            </button>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="font-semibold">הסריקה נכשלה</span>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-sm text-red-300 break-words">{errorMsg}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleScan}
                className="flex-1 py-2.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 text-sm font-medium transition-all"
              >
                נסה שוב
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-all"
              >
                סגור
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
