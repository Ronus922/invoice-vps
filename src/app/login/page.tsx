'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Exact replica of the approved mockup (InvoiceFlow Login.html) — values are
// copied verbatim from its rendered DOM; don't "normalize" them to tokens.

const heroPanel: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: '64px 72px',
  boxSizing: 'border-box',
  background:
    'radial-gradient(900px 640px at 20% 0%, rgb(26, 58, 110) 0%, rgb(18, 41, 79) 48%, rgb(11, 24, 48) 100%)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 48,
  borderRadius: 13,
  border: '1px solid rgba(126, 152, 210, 0.25)',
  background: 'rgba(11, 24, 48, 0.6)',
  color: 'rgb(244, 247, 253)',
  fontFamily: 'Heebo, sans-serif',
  fontSize: 15,
  padding: '0 14px',
  outline: 'none',
}

function Logo({ size = 52, icon = 30 }: { size?: number; icon?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        background: 'linear-gradient(160deg, rgb(36, 20, 84) 0%, rgb(23, 12, 58) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow:
          'rgba(4, 10, 26, 0.5) 0px 8px 24px, rgba(120, 140, 200, 0.2) 0px 0px 0px 1px inset',
        flexShrink: 0,
      }}
    >
      <svg width={icon} height={icon} viewBox="0 0 44 44" fill="none">
        <path
          d="M8 26 C8 17 14 11 22 11 C30 11 36 17 36 26"
          stroke="#2dd4bf"
          strokeWidth="3.6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M17 26 L22 20 L27 26"
          stroke="#2dd4bf"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="14" cy="31" r="2.2" fill="#2dd4bf" />
        <circle cx="30" cy="31" r="2.2" fill="#2dd4bf" />
      </svg>
    </div>
  )
}

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
      dir="rtl"
      className="grid grid-cols-1 lg:grid-cols-2"
      style={{ minHeight: '100vh', background: 'rgb(11, 24, 48)', fontFamily: 'Heebo, sans-serif' }}
    >
      <style>{`
        @keyframes floatY { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-14px); } }
        @keyframes glowPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.95; } }
      `}</style>

      {/* Hero panel — right side in RTL, hidden on mobile */}
      <div className="hidden lg:flex" style={heroPanel}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(126, 152, 210, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(126, 152, 210, 0.06) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: -180,
            left: -120,
            width: 520,
            height: 520,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(45, 212, 191, 0.16) 0%, rgba(45, 212, 191, 0) 65%)',
            animation: 'glowPulse 7s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 480 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Logo />
            <span
              dir="ltr"
              style={{ fontSize: 24, fontWeight: 800, color: 'rgb(244, 247, 253)', letterSpacing: '-0.4px' }}
            >
              InvoiceFlow
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 46,
                lineHeight: 1.15,
                fontWeight: 900,
                color: 'rgb(244, 247, 253)',
                textWrap: 'pretty',
                // globals.css forces h1/h2/h3 to Manrope (no Hebrew glyphs) — must override inline
                fontFamily: 'Heebo, sans-serif',
              }}
            >
              כל החשבוניות שלך.
              <br />
              במקום אחד. <span style={{ color: 'rgb(45, 212, 191)' }}>אוטומטית.</span>
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 17,
                lineHeight: 1.7,
                color: 'rgb(143, 176, 232)',
                fontWeight: 400,
              }}
            >
              סורקים, מחלצים נתונים ועוקבים אחרי כל חשבונית — בלי הקלדה ידנית ובלי ניירת שהולכת
              לאיבוד.
            </p>
          </div>

          <div style={{ marginTop: 8, animation: 'floatY 6s ease-in-out infinite' }}>
            <div
              style={{
                width: 340,
                background:
                  'linear-gradient(175deg, rgba(37, 58, 99, 0.75) 0%, rgba(24, 40, 74, 0.75) 100%)',
                border: '1px solid rgba(126, 152, 210, 0.25)',
                borderRadius: 16,
                padding: '18px 20px',
                boxShadow: 'rgba(4, 10, 26, 0.5) 0px 24px 48px',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'rgb(201, 216, 242)' }}>
                  חשבונית #2481 נסרקה
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'rgb(11, 24, 48)',
                    background: 'rgb(45, 212, 191)',
                    borderRadius: 999,
                    padding: '3px 10px',
                  }}
                >
                  חולצה אוטומטית
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'rgb(126, 151, 196)' }}>ספק: אופיס סנטר בע&quot;מ</span>
                <span dir="ltr" style={{ fontSize: 20, fontWeight: 800, color: 'rgb(244, 247, 253)' }}>
                  ₪ 1,240
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: 'rgba(126, 152, 210, 0.18)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: '82%',
                    height: '100%',
                    borderRadius: 999,
                    background: 'linear-gradient(90deg, rgb(45, 212, 191), rgb(94, 234, 212))',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Login panel — left side in RTL */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 48px',
          boxSizing: 'border-box',
          background: 'rgb(14, 31, 61)',
          borderRight: '1px solid rgba(126, 152, 210, 0.14)',
          position: 'relative',
        }}
      >
        <div
          style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 28 }}
        >
          {/* Mobile-only logo (hero is hidden there) */}
          <div className="flex lg:hidden" style={{ alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <Logo />
            <span
              dir="ltr"
              style={{ fontSize: 24, fontWeight: 800, color: 'rgb(244, 247, 253)', letterSpacing: '-0.4px' }}
            >
              InvoiceFlow
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 800,
                color: 'rgb(244, 247, 253)',
                fontFamily: 'Heebo, sans-serif',
              }}
            >
              ברוכים הבאים 👋
            </h2>
            <p style={{ margin: 0, fontSize: 15, color: 'rgb(143, 176, 232)' }}>
              התחברו כדי להמשיך לניהול החשבוניות שלכם
            </p>
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(248, 113, 113, 0.12)',
                border: '1px solid rgba(248, 113, 113, 0.3)',
                borderRadius: 13,
                padding: '12px 16px',
                fontSize: 14,
                color: 'rgb(252, 165, 165)',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              style={{
                width: '100%',
                height: 54,
                border: 'none',
                borderRadius: 13,
                background: 'rgb(255, 255, 255)',
                color: 'rgb(29, 43, 69)',
                fontFamily: 'Heebo, sans-serif',
                fontSize: 16.5,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                cursor: googleLoading ? 'not-allowed' : 'pointer',
                boxShadow: 'rgba(4, 10, 26, 0.4) 0px 6px 18px',
                transition: 'transform 0.12s, box-shadow 0.12s',
                opacity: googleLoading ? 0.6 : 1,
              }}
            >
              {googleLoading ? (
                <div
                  style={{
                    width: 20,
                    height: 20,
                    border: '2px solid rgba(29, 43, 69, 0.25)',
                    borderTopColor: 'rgb(29, 43, 69)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                  className="animate-spin"
                />
              ) : (
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path
                    fill="#FFC107"
                    d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C41.4 35.4 44 30.1 44 24c0-1.3-.1-2.6-.4-3.9z"
                  />
                </svg>
              )}
              <span>{googleLoading ? 'מתחבר...' : 'התחבר עם Google'}</span>
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: 13,
                color: 'rgb(126, 151, 196)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2 L20 6 V11 C20 16.5 16.6 20.6 12 22 C7.4 20.6 4 16.5 4 11 V6 Z"
                  stroke="#2dd4bf"
                  strokeWidth="1.8"
                  fill="rgba(45,212,191,0.12)"
                />
                <path
                  d="M9 12 L11.2 14.2 L15.2 9.8"
                  stroke="#2dd4bf"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>התחברות מהירה ומאובטחת עם חשבון Google שלך</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(126, 152, 210, 0.2)' }} />
              <span style={{ fontSize: 12.5, color: 'rgb(93, 114, 156)' }}>או</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(126, 152, 210, 0.2)' }} />
            </div>

            {!showEmailLogin ? (
              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={() => setShowEmailLogin(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'rgb(45, 212, 191)',
                    cursor: 'pointer',
                    fontFamily: 'Heebo, sans-serif',
                  }}
                >
                  אפשרויות התחברות נוספות
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleEmailLogin}
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label
                    htmlFor="email"
                    style={{ fontSize: 14, fontWeight: 500, color: 'rgb(143, 176, 232)' }}
                  >
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
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label
                    htmlFor="password"
                    style={{ fontSize: 14, fontWeight: 500, color: 'rgb(143, 176, 232)' }}
                  >
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
                    style={inputStyle}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    height: 54,
                    borderRadius: 13,
                    border: '1px solid rgba(126, 152, 210, 0.25)',
                    background: 'rgba(126, 152, 210, 0.12)',
                    color: 'rgb(244, 247, 253)',
                    fontFamily: 'Heebo, sans-serif',
                    fontSize: 16.5,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading && (
                    <div
                      className="animate-spin"
                      style={{
                        width: 16,
                        height: 16,
                        border: '2px solid rgba(244, 247, 253, 0.3)',
                        borderTopColor: 'rgb(244, 247, 253)',
                        borderRadius: '50%',
                      }}
                    />
                  )}
                  <span>{loading ? 'מתחבר...' : 'התחבר'}</span>
                </button>
              </form>
            )}
          </div>

          <div
            dir="ltr"
            style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: 'rgb(93, 114, 156)' }}
          >
            InvoiceFlow &copy; {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </div>
  )
}
