'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showEmailLogin, setShowEmailLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const e = new URLSearchParams(window.location.search).get('error')
    if (e === 'forbidden') return 'החשבון הזה אינו מורשה לגשת למערכת.'
    if (e === 'auth') return 'שגיאה בהתחברות. נסה שוב.'
    return null
  })

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) {
      setError('שגיאה בהתחברות עם Google. נסה שוב.')
      setGoogleLoading(false)
    }
    // Redirect happens automatically — no need to handle success
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('אימייל או סיסמה שגויים.')
    } else {
      router.push('/')
      router.refresh()
      return
    }

    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 px-4"
      dir="rtl"
    >
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl shadow-lg shadow-blue-500/20 overflow-hidden">
            <img src="/icon-192.png" alt="InvoiceFlow" className="w-full h-full" />
          </div>
          <h1 className="text-3xl font-bold text-white">InvoiceFlow</h1>
          <p className="text-sm text-blue-300/80">
            ניהול חשבוניות חכם — סריקה, חילוץ ומעקב
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5 shadow-ambient">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300 text-center">
              {error}
            </div>
          )}

          {/* Google Sign-In — Primary */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-medium px-4 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {googleLoading ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            <span>{googleLoading ? 'מתחבר...' : 'התחבר עם Google'}</span>
          </button>

          <p className="text-center text-xs text-white/30">
            התחברות מהירה ומאובטחת עם חשבון Google שלך
          </p>

          {/* Divider + Email option */}
          {!showEmailLogin && (
            <div className="pt-2">
              <button
                onClick={() => setShowEmailLogin(true)}
                className="w-full text-sm text-white/30 hover:text-white/50 transition-colors py-2"
              >
                אפשרויות התחברות נוספות
              </button>
            </div>
          )}

          {showEmailLogin && (
            <>
              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-white/30">או עם אימייל</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-white/70">
                    אימייל
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    dir="ltr"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="block text-sm font-medium text-white/70">
                    סיסמה
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="לפחות 6 תווים"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium px-4 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  <span>{loading ? 'מתחבר...' : 'התחבר'}</span>
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-white/20">
          InvoiceFlow &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
