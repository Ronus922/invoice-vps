// Shared helpers for scripts/check-*.mjs — no external deps (uses psql + fetch).
// ponytail: one tiny lib instead of repeating env parsing + psql plumbing in 7 files.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Load .env.local into process.env (does not override already-set vars, so CI
// can inject them instead). Minimal KEY=VALUE parser — quotes stripped.
export function loadEnv() {
  const f = join(ROOT, '.env.local')
  if (!existsSync(f)) return
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }
}

export function repoRoot() {
  return ROOT
}

// Run one SQL statement, return trimmed stdout. Throws on psql error.
export function psql(sql, { url = process.env.DIRECT_URL, args = ['-tAc'] } = {}) {
  if (!url) throw new Error('no DB url (DIRECT_URL) — is .env.local present?')
  // stderr piped (not inherited) so expected failures (e.g. a unique-violation
  // we deliberately trigger) don't leak psql ERROR text to the console.
  return execFileSync('psql', [url, ...args, sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

// A single scalar (first column of first row) as string.
export function scalar(sql, opts) {
  return psql(sql, opts).split('\n')[0].trim()
}

let failed = false
const problems = []

export function fail(msg) {
  failed = true
  problems.push(msg)
  console.error('  ✗ ' + msg)
}

export function ok(msg) {
  console.log('  ✓ ' + msg)
}

export function info(msg) {
  console.log('  · ' + msg)
}

// Call at the end of every check. Exit 0 only if nothing failed.
export function done(name) {
  if (failed) {
    console.error(`\n✗ ${name} — נכשל (${problems.length} בעיות)`)
    process.exit(1)
  }
  console.log(`\n✓ ${name} — עבר`)
  process.exit(0)
}

// Wrap a check body so any thrown error is a clean failure, not a stack dump.
export async function run(name, body) {
  console.log(`\n▶ ${name}`)
  loadEnv()
  try {
    await body()
  } catch (err) {
    fail('שגיאה בלתי צפויה: ' + (err instanceof Error ? err.message : String(err)))
  }
  done(name)
}
