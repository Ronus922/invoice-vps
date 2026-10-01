import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// PUBLIC BY DESIGN — the uptime-monitor probe (UptimeRobot), listed in the
// PUBLIC set of scripts/check-api-auth.mjs and exempted in src/middleware.ts.
// It takes no input, mutates nothing, and answers with two booleans only.
// Never add detail here (versions, paths, table/account names, error text):
// this body is world-readable.
export const dynamic = 'force-dynamic'

const DB_TIMEOUT_MS = 5000

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  let db = false
  try {
    // Cheapest real round-trip to Postgres (the REST equivalent of SELECT 1):
    // a single indexed row, body discarded. The abort signal keeps a hung DB
    // from holding the monitor's connection open.
    const { error } = await supabase
      .from('gmail_tokens')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
    db = !error
  } catch {
    db = false
  }

  return NextResponse.json(
    { ok: db, db },
    { status: db ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  )
}
