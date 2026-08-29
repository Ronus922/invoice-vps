'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, AlertCircle, ExternalLink, RotateCcw } from 'lucide-react'

interface BackupStatus {
  lastBackupAt: string | null
  lastError: string | null
  enabled: boolean
  connected: boolean
  running: boolean
  totalBackedUp: number
  pendingCount: number
  driveRootFolderId: string | null
  progress: {
    phase: string
    total: number
    processed: number
    uploaded: number
    skipped: number
    errors: number
  } | null
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

// Line-drawn Google Drive triangle, single stroke color to match the panel's
// muted icon treatment (the brand's tri-color fill would clash with the palette).
function DriveTriangleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M8.5 3h7L22 12.5l-3.5 6h-13l-3.5-6L8.5 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M8.5 3 12 9.2M15.5 3 12 9.2M2 12.5h9.2M12.8 12.5H22" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

const CARD = 'rounded-[13px] bg-[rgba(126,152,210,0.06)] border border-[rgba(126,152,210,0.14)]'

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
        <Loader2 className="w-5 h-5 text-[#8fb0e8] animate-spin" />
      </div>
    )
  }

  const connected = status?.connected === true
  const totalBackedUp = status?.totalBackedUp ?? 0
  const pendingCount = status?.pendingCount ?? 0
  const total = totalBackedUp + pendingCount
  const running = status?.running === true
  const runProgress = running ? (status?.progress ?? null) : null
  // While a backup runs, the bar is scoped to THIS run's transfers only —
  // 0% at the first pending invoice, 100% at the last. The cumulative
  // backed-up ratio is shown only at rest (otherwise a run "starts" at 90%+).
  const uploading = runProgress?.phase === 'uploading' || runProgress?.phase === 'done'
  const ratio = running
    ? uploading && runProgress && runProgress.total > 0
      ? Math.round((runProgress.processed / runProgress.total) * 100)
      : 0
    : total > 0
      ? Math.round((totalBackedUp / total) * 100)
      : 0

  const errored = !running && !!status?.lastError
  const showRetry = errored || !!triggerError

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* Connection status card */}
      <div className={`${CARD} px-4 py-3.5 flex items-center gap-3`}>
        <span
          className="w-[9px] h-[9px] rounded-full flex-shrink-0"
          style={{
            background: connected ? '#2dd4bf' : '#5d729c',
            boxShadow: connected ? '0 0 8px rgba(45,212,191,0.7)' : 'none',
          }}
        />
        <div className="flex-1 min-w-0 text-right">
          <p className="text-[15px] font-bold text-[#f4f7fd]">
            {connected ? 'Google Drive מחובר' : 'Google Drive לא מחובר'}
          </p>
          <p className="text-xs text-[#8fb0e8] mt-0.5">
            {connected ? 'אוטומטי אחת לחודש, בתיקיות שנה/חודש' : 'דרוש חיבור כדי להפעיל גיבוי'}
          </p>
        </div>
        <div className="w-[38px] h-[38px] flex-shrink-0 rounded-[11px] bg-[rgba(126,152,210,0.1)] flex items-center justify-center">
          <DriveTriangleIcon className="w-[18px] h-[18px] text-[#8fb0e8]" />
        </div>
      </div>

      {!connected && (
        <div className="rounded-[13px] border border-amber-500/30 bg-amber-500/10 px-4 py-3">
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

      {/* Data cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`${CARD} px-4 py-3`}>
          <p className="text-xs text-[#7e97c4]">גיבוי אחרון</p>
          <p className="text-[15px] font-bold text-[#f4f7fd] mt-1" dir="ltr">
            {formatDate(status?.lastBackupAt ?? null)}
          </p>
        </div>
        <div className={`${CARD} px-4 py-3`}>
          <p className="text-xs text-[#7e97c4]">גובו / סה&quot;כ</p>
          <p className="text-[17px] font-extrabold text-[#2dd4bf] mt-1" dir="ltr">
            {totalBackedUp} / {total}
          </p>
        </div>
      </div>

      {/* Progress / error area */}
      {running && (
        <div className="rounded-[13px] bg-[rgba(45,212,191,0.05)] border border-[rgba(45,212,191,0.18)] px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-4 h-4 rounded-full animate-spin"
                style={{
                  border: '2px solid rgba(45,212,191,0.25)',
                  borderTopColor: '#2dd4bf',
                  animationDuration: '0.9s',
                }}
              />
              <span className="text-sm font-medium text-[#f4f7fd]">
                {!runProgress || runProgress.phase === 'init'
                  ? 'מתחיל גיבוי...'
                  : runProgress.phase === 'reorganizing'
                    ? 'מסדר קבצים קיימים בדרייב...'
                    : 'מגבה כעת...'}
              </span>
            </div>
            <span className="text-sm font-bold text-[#2dd4bf]" dir="ltr">
              {ratio}%
            </span>
          </div>
          <div className="w-full h-[7px] rounded-full bg-[rgba(126,152,210,0.15)] overflow-hidden mt-3">
            <div
              className="h-full rounded-full transition-[width] duration-400"
              style={{
                width: `${Math.max(ratio, ratio > 0 ? 4 : 0)}%`,
                minWidth: ratio > 0 ? '10px' : 0,
                background: 'linear-gradient(90deg, #2dd4bf, #5eead4)',
              }}
            />
          </div>
          {runProgress && runProgress.total > 0 && (
            <p className="text-xs text-[#7e97c4] mt-2 text-center">
              מגבה קובץ {runProgress.processed} מתוך {runProgress.total} בסבב הנוכחי
            </p>
          )}
        </div>
      )}

      {showRetry && (
        <div className="rounded-[13px] bg-[rgba(244,113,113,0.08)] border border-[rgba(244,113,113,0.3)] px-4 py-3.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300 break-words flex-1">
              {triggerError || status?.lastError}
            </p>
          </div>
          <button
            onClick={handleBackupNow}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-[12px] border border-[rgba(244,113,113,0.35)] text-red-300 hover:bg-[rgba(244,113,113,0.1)] text-sm font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            נסה שוב
          </button>
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={handleBackupNow}
          disabled={running || !connected}
          className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors disabled:cursor-not-allowed"
          style={
            running
              ? { background: 'rgba(45,212,191,0.35)', color: '#0b1830' }
              : { background: connected ? '#2dd4bf' : 'rgba(45,212,191,0.35)', color: '#0b1830' }
          }
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              גיבוי פעיל...
            </>
          ) : (
            'גבה עכשיו'
          )}
        </button>

        <a
          href={
            status?.driveRootFolderId
              ? `https://drive.google.com/drive/folders/${status.driveRootFolderId}`
              : 'https://drive.google.com/drive/my-drive'
          }
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl border border-[rgba(126,152,210,0.25)] text-[#c9d8f2] hover:bg-white/5 text-sm font-medium transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          פתח בגוגל דרייב
        </a>
      </div>
    </div>
  )
}
