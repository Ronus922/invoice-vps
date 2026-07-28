#!/usr/bin/env node
// INVARIANT: every API route enforces authorization server-side.
//   Each src/app/api/**/route.ts must gate on getAuthenticatedUser() (session +
//   allowlist) OR CRON_SECRET (machine jobs). Skipping the gate would expose
//   invoice data / mutations to any anonymous caller — RLS is bypassed because
//   these routes use the service-role key.
import { run, repoRoot, fail, ok } from './_lib.mjs'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

// Routes that are legitimately public. Keep this list tiny and justified.
const PUBLIC = new Set([
  'src/app/api/auth/logout/route.ts', // only clears a session cookie — safe unauthenticated
])

run('check-api-auth', async () => {
  const root = repoRoot()
  const files = execFileSync('bash', ['-c', "cd '" + root + "' && find src/app/api -name route.ts | sort"], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)

  if (files.length === 0) return fail('לא נמצאו route handlers — האם הנתיב השתנה?')

  for (const rel of files) {
    if (PUBLIC.has(rel)) {
      ok(`${rel} — public מותר`)
      continue
    }
    const src = readFileSync(join(root, rel), 'utf8')
    const gated = src.includes('getAuthenticatedUser') || src.includes('CRON_SECRET')
    if (gated) ok(`${rel} — מאובטח`)
    else fail(`${rel} — אין getAuthenticatedUser / CRON_SECRET (route חשוף!)`)
  }
})
