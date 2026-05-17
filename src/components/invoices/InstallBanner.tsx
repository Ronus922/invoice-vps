'use client'

import { useState, useEffect } from 'react'
import { X, Download, Share } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallBanner() {
  const [show, setShow] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone)
    setIsStandalone(!!standalone)

    if (standalone) return

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(ios)

    const dismissed = localStorage.getItem('install_banner_dismissed')
    if (dismissed) {
      const dismissedAt = new Date(dismissed).getTime()
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return
    }

    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (!isMobile) return

    if (ios) {
      setShow(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setShow(false)
      }
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setShow(false)
    localStorage.setItem('install_banner_dismissed', new Date().toISOString())
  }

  if (!show || isStandalone) return null

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 p-3 overflow-hidden"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      dir="rtl"
    >
      <div className="bg-[#1a0a3e] border border-[#00e5d0]/30 rounded-2xl p-4 shadow-2xl shadow-black/40 max-w-full overflow-hidden">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-[#1a0a3e] border border-[#00e5d0]/20">
            <img src="/icon-192.png" alt="InvoiceFlow" className="w-full h-full" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-bold truncate">התקן את InvoiceFlow</p>
            {isIOS ? (
              <p className="text-white/50 text-xs mt-0.5 leading-relaxed">
                לחץ על <Share className="w-3 h-3 inline-block mx-0.5 -mt-0.5" /> ואז &quot;הוסף למסך הבית&quot;
              </p>
            ) : (
              <p className="text-white/50 text-xs mt-0.5">
                גישה מהירה מהמסך הראשי
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isIOS && (
              <button
                onClick={handleInstall}
                className="bg-[#00e5d0] hover:bg-[#00d4c0] text-[#1a0a3e] font-bold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                התקן
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="text-white/30 hover:text-white/60 p-2 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
