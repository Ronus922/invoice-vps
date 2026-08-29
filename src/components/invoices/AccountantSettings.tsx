'use client'

import { useState, useEffect } from 'react'
import { Loader2, Check, Mail } from 'lucide-react'
import { SidePanel } from '@/components/ui/side-panel'

interface AccountantSettingsProps {
  open: boolean
  onClose: () => void
}

export default function AccountantSettings({ open, onClose }: AccountantSettingsProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    setSaved(false)
    fetch('/api/settings/accountant-email')
      .then((r) => r.json())
      .then((data) => {
        setEmail(data.email || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [open])

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
    <SidePanel
      open={open}
      onClose={onClose}
      title="רואה חשבון"
      subtitle="שליחת חשבוניות אוטומטית במייל"
      icon={Mail}
    >
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-[#8fb0e8] animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-[12.5px] text-[#8fb0e8] mb-1.5">
              כתובת מייל של רואה החשבון
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="accountant@example.com"
              className="w-full h-11 px-3.5 rounded-[11px] bg-[rgba(126,152,210,0.07)] border border-[rgba(126,152,210,0.18)] text-[#f4f7fd] placeholder:text-[#5d729c] focus:outline-none focus:border-[rgba(45,212,191,0.5)] transition-colors text-sm"
              dir="ltr"
            />
            <p className="text-xs text-[#7e97c4] mt-2">
              כל חשבונית שתעלה תישלח אוטומטית לכתובת זו
            </p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-[11px] bg-[#2dd4bf] hover:brightness-110 text-[#0b1830] font-bold text-sm transition-[filter] disabled:opacity-60"
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
    </SidePanel>
  )
}
