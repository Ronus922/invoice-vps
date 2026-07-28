'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, Send } from 'lucide-react'
import { type Invoice } from '@/lib/entities'

interface UnsentAccountantBannerProps {
  invoices: Invoice[]
  onRefresh: () => void
}

export default function UnsentAccountantBanner({
  invoices,
  onRefresh,
}: UnsentAccountantBannerProps) {
  const [isSending, setIsSending] = useState(false)

  const unsent = invoices.filter(
    (inv) =>
      !inv.sent_to_accountant_at &&
      !inv.needs_review &&
      inv.accountant_send_error !== 'needs_review' &&
      inv.file_url
  )

  if (unsent.length === 0) return null

  const sendAll = async () => {
    if (isSending) return
    setIsSending(true)
    try {
      // Batches of 3 — an unbounded Promise.all over dozens of invoices trips
      // Gmail rate limits; the server also skips already-sent rows.
      const BATCH = 3
      for (let i = 0; i < unsent.length; i += BATCH) {
        await Promise.all(
          unsent.slice(i, i + BATCH).map((inv) =>
            fetch('/api/send-to-accountant', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                invoice_id: inv.id,
                file_url: inv.file_url,
                vendor: inv.vendor || '',
                date: inv.date || '',
              }),
            }).catch(() => null)
          )
        )
      }
    } finally {
      setIsSending(false)
      onRefresh()
    }
  }

  return (
    <div
      className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3 flex-wrap"
      dir="rtl"
    >
      <div className="bg-red-500/20 p-2 rounded-xl flex-shrink-0">
        <AlertTriangle className="w-5 h-5 text-red-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-red-200">
          {unsent.length} חשבוניות לא נשלחו לרואה חשבון
        </p>
        <p className="text-xs text-red-300/70 mt-0.5">
          ניתן לשלוח כל אחת בנפרד מהטבלה, או את כולן יחד
        </p>
      </div>
      <button
        type="button"
        onClick={sendAll}
        disabled={isSending}
        className="inline-flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-100 text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            שולח...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            שלח את כולן
          </>
        )}
      </button>
    </div>
  )
}
