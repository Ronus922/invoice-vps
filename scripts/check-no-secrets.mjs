#!/usr/bin/env node
// INVARIANT: no secret is committed to git.
//   (1) No .env file other than *.example is tracked.
//   (2) None of the actual secret VALUES from .env.local appear in any tracked
//       file. This catches a real leak regardless of pattern.
//   (3) No obvious key patterns (sk-ant-..., service_role JWT) in tracked code.
// Never prints a secret value — only the offending KEY name + file.
import { run, repoRoot, loadEnv, fail, ok, info } from './_lib.mjs'
import { execFileSync } from 'node:child_process'

const SENSITIVE_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY', 'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN', 'CRON_SECRET', 'DATABASE_URL', 'DIRECT_URL',
]

function tracked(root) {
  return execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
}

// git grep for a fixed string; returns matching files (empty if none).
function grepFixed(root, needle) {
  try {
    // -e so needles beginning with '-' (e.g. "-----BEGIN") aren't parsed as flags.
    return execFileSync('git', ['-C', root, 'grep', '-l', '-F', '-e', needle], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)
  } catch {
    return [] // exit 1 = no match
  }
}

run('check-no-secrets', async () => {
  const root = repoRoot()
  loadEnv()

  // (1) tracked env files
  const envFiles = tracked(root).filter((f) => /(^|\/)\.env/.test(f) && !f.endsWith('.example'))
  if (envFiles.length === 0) ok('אין קבצי .env במעקב git (מלבד *.example)')
  else fail('קבצי env במעקב git: ' + envFiles.join(', '))

  // (2) literal secret values leaked into tracked files
  let leaked = 0
  for (const key of SENSITIVE_KEYS) {
    const val = process.env[key]
    if (!val || val.length < 12) continue
    const hits = grepFixed(root, val).filter((f) => !f.endsWith('.example'))
    if (hits.length) {
      fail(`הערך של ${key} מופיע בקבצים במעקב: ${hits.join(', ')}`)
      leaked++
    }
  }
  if (leaked === 0) ok('אף ערך סוד מ-.env.local לא מופיע בקבצים במעקב')

  // (3) generic key shapes
  const patterns = [
    ['sk-ant-', 'מפתח Anthropic'],
    ['"role":"service_role"', 'JWT service_role'],
    ['-----BEGIN', 'מפתח פרטי'],
  ]
  let patternHit = 0
  for (const [needle, label] of patterns) {
    const hits = grepFixed(root, needle).filter((f) => !f.endsWith('.example') && !f.startsWith('scripts/check-'))
    if (hits.length) { fail(`${label} (${needle}) בקבצים: ${hits.join(', ')}`); patternHit++ }
  }
  if (patternHit === 0) ok('אין תבניות מפתח חשודות בקוד המנוהל')

  info('.env.local קיים מקומית ולא במעקב — כך צריך')
})
