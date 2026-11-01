// Next.js instrumentation hook — runs once per server runtime at boot.
// Server-side Sentry, opt-in via SENTRY_DSN (the billing/guesthub pattern):
//   - the DSN is read from the process environment at RUNTIME (invoice.service
//     gets it from its env file), so a restart turns Sentry on or off — no
//     rebuild. Next inlines only NEXT_PUBLIC_* and next.config `env` (none here).
//   - no DSN → nothing is initialised, nothing is sent, the app boots as before.
//   - one line per boot in `journalctl -u invoice.service` says which it was;
//     the DSN itself is never logged.
//   - Node.js runtime only, errors only: tracesSampleRate 0 (free-plan quota).
//     No browser SDK, no source-map upload, no next.config wrapper.
import type { Instrumentation } from 'next'

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dsn = process.env.SENTRY_DSN
    if (dsn) {
      const Sentry = await import('@sentry/nextjs')
      // v11 collects the client IP and x-forwarded-for by default (dataCollection);
      // v10 did not. userInfo: false keeps the v10 behaviour. Cookies, authorization
      // and secret headers are filtered by v11 on its own.
      Sentry.init({ dsn, tracesSampleRate: 0, dataCollection: { userInfo: false } })
      console.info('[sentry] Sentry initialized')
    } else {
      console.info('[sentry] Sentry disabled (no DSN)')
    }
  }
}

// Errors thrown by Server Components, route handlers and server actions before
// any code of ours could catch them. A no-op without a DSN, and outside the
// Node.js runtime (register() initialises nothing there). Routes that catch an
// error themselves and answer 500 never reach this hook — those stay in the
// journal only.
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/nextjs')
    Sentry.captureRequestError(...args)
  }
}
