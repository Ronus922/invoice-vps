'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    // ponytail: best-effort ask to keep cookies out of storage-pressure eviction
    // on mobile Chrome after long idle gaps — no prompt, silently ignored if denied.
    navigator.storage?.persist?.().catch(() => {})
  }, [])

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
