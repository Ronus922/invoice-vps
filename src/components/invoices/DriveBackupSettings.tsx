'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { HardDrive, Loader2, CheckCircle2, AlertCircle, Cloud, ExternalLink } from 'lucide-react'

interface BackupStatus {
  lastBackupAt: string | null
  lastError: string | null
  enabled: boolean
  connected: boolean
  running: boolean
  totalBackedUp: number
  pendingCount: number
  driveRootFolderId: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return 'טרם בוצע'
  const d = new Date(iso)
  return d.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DriveBackupSettings() {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggerError, setTriggerError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/backup-to-drive', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as BackupStatus
      setStatus(data)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    const shouldPoll = status?.running === true
    if (shouldPoll && !pollRef.current) {
      pollRef.current = setInterval(loadStatus, 2000)
    } else if (!shouldPoll && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [status?.running, loadStatus])

  const handleBackupNow = async () => {
    setTriggerError('')
    try {
      const res = await fetch('/api/backup-to-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok && res.status !== 202) {
        const data = await res.json().catch(() => ({}))
        setTriggerError(data.message || 'הגיבוי נכשל')
        return
      }
      await loadStatus()
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : 'שגיאת רשת')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
      </div>
    )
  }

  const totalBackedUp = status?.totalBackedUp ?? 0
  const pendingCount = status?.pendingCount ?? 0
  const total = totalBackedUp + pendingCount
  const ratio = total > 0 ? Math.round((totalBackedUp / total) * 100) : 0
  const running = status?.running === true

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4" dir="rtl">
      <div className="flex items-center gap-3 mb-3">
        <div className="bg-gradient-to-br from-blue-500/30 to-indigo-600/20 border border-blue-400/30 p-2 rounded-lg">
          <HardDrive className="w-4 h-4 text-blue-300" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-bold text-white">גיבוי לגוגל דרייב</h4>
          <p className="text-[11px] text-white/40">אוטומטי אחת לחודש, בתיקיות שנה/חודש</p>
        </div>
      </div>

      {!status?.connected && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs text-amber-200 mb-2">
            דרושה הרשאה ל-Google Drive. חדש את חיבור Gmail כדי להפעיל גיבוי.
          </p>
          <a
            href="/api/gmail-auth"
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-300 hover:text-amber-200 underline"
          >
            חדש חיבור Gmail
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-white/40">גיבוי אחרון</p>
          <p className="text-[11px] font-medium text-white/80 mt-0.5">
            {formatDate(status?.lastBackupAt ?? null)}
          </p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-white/40">גובו / סה&quot;כ</p>
          <p className="text-xs font-bold text-emerald-400 mt-0.5">
            {totalBackedUp} / {total}
          </p>
        </div>
      </div>

      <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-l from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${ratio}%` }}
        />
      </div>
      <p className="text-[11px] text-white/50 text-center mb-3">
        {running ? `מגבה ברקע... ${ratio}%` : `${ratio}%`}
      </p>

      {status?.lastError && !running && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-300 break-words">{status.lastError}</p>
        </div>
      )}

      {triggerError && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-300 break-words">{triggerError}</p>
        </div>
      )}

      <button
        onClick={handleBackupNow}
        disabled={running || !status?.connected}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 text-sm font-medium transition-all disabled:opacity-50 min-h-[44px]"
      >
        {running ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>מגבה ברקע...</span>
          </>
        ) : pendingCount === 0 && totalBackedUp > 0 ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            <span>הכול מגובה</span>
          </>
        ) : (
          <>
            <Cloud className="w-4 h-4" />
            <span>גבה עכשיו לדרייב</span>
          </>
        )}
      </button>

      {status?.connected && (
        <a
          href={
            status.driveRootFolderId
              ? `https://drive.google.com/drive/folders/${status.driveRootFolderId}`
              : 'https://drive.google.com/drive/my-drive'
          }
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-sm font-medium transition-all min-h-[44px]"
        >
          <ExternalLink className="w-4 h-4" />
          <span>פתח בגוגל דרייב</span>
        </a>
      )}
    </div>
  )
}
