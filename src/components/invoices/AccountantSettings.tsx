'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, Check, Mail } from 'lucide-react'

interface AccountantSettingsProps {
  onClose: () => void
}

export default function AccountantSettings({ onClose }: AccountantSettingsProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings/accountant-email')
      .then((r) => r.json())
      .then((data) => {
        setEmail(data.email || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setError('')
    setSaving(true)
    setSaved(false)

    const res = await fetch('/api/settings/accountant-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error || 'שגיאה בשמירה')
      return
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

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
            <div className="bg-gradient-to-br from-emerald-500/30 to-teal-600/20 border border-emerald-400/30 p-2.5 rounded-xl">
              <Mail className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">רואה חשבון</h3>
              <p className="text-xs text-white/40">שליחת חשבוניות אוטומטית במייל</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                כתובת מייל של רואה החשבון
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="accountant@example.com"
                className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-xl text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20 transition-all text-sm"
                dir="ltr"
              />
              <p className="text-xs text-white/30 mt-2">
                כל חשבונית שתעלה תישלח אוטומטית לכתובת זו
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 rounded-xl font-medium text-sm transition-all disabled:opacity-50 min-h-[44px]"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>נשמר</span>
                </>
              ) : (
                <span>שמור</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
