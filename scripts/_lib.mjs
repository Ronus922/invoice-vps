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

// --- Guard for checks that WRITE (CREATE/DROP DATABASE) ----------------------
// A write test must run on a disposable Postgres, never on the real cluster.
// isolatedDbUrl() is the only way such a check gets its URL: it reads a
// dedicated env var (never DIRECT_URL) and refuses, before any connection is
// made, anything that is or could be production. Error text names the rule
// and the host the caller supplied, never a URL, user or password.
const PROD_HOST_SUFFIXES = ['bios.co.il']
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

function hostPort(raw) {
  try {
    const u = new URL(raw)
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null
    return { host: u.hostname.toLowerCase().replace(/^\[|\]$/g, ''), port: u.port || '5432' }
  } catch {
    return null
  }
}

const hpKey = ({ host, port }) => `${LOOPBACK_HOSTS.has(host) ? 'loopback' : host}:${port}`

// host:port of every postgres URL this app is configured with — the process
// environment AND .env.local, even if the env var already shadows the file.
// `except` is the variable being validated: it must not be compared with itself.
function configuredDbTargets(except) {
  const values = Object.entries(process.env).filter(([k]) => k !== except).map(([, v]) => v)
  const f = join(ROOT, '.env.local')
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*[A-Z0-9_]+\s*=\s*(.*)\s*$/)
      if (m) values.push(m[1].trim().replace(/^["']|["']$/g, ''))
    }
  }
  const keys = new Set()
  for (const v of values) {
    const t = typeof v === 'string' && /^postgres(ql)?:\/\//.test(v) ? hostPort(v) : null
    if (t) keys.add(hpKey(t))
  }
  return keys
}

export function isolatedDbUrl(envName) {
  const raw = process.env[envName]
  if (!raw) {
    throw new Error(`${envName} is not set — this check only writes to a disposable Postgres, never to DIRECT_URL`)
  }
  const t = hostPort(raw)
  if (!t) throw new Error(`${envName} is not a valid postgres:// URL`)
  const refuse = (why) => {
    throw new Error(
      `refusing to run: ${envName} (host "${t.host}") ${why}. ` +
        'This check creates and drops a database; point it at a disposable Postgres (the CI service container) only.'
    )
  }
  if (PROD_HOST_SUFFIXES.some((s) => t.host === s || t.host.endsWith('.' + s))) {
    refuse('points at a production host (*.bios.co.il)')
  }
  if (configuredDbTargets(envName).has(hpKey(t))) {
    refuse('has the same host:port as a database this app is configured with (DIRECT_URL / DATABASE_URL / .env.local)')
  }
  if (LOOPBACK_HOSTS.has(t.host) && process.env.GITHUB_ACTIONS !== 'true' && process.env.CHECK_ISOLATED_ALLOW_LOOPBACK !== '1') {
    refuse('is a loopback address outside GitHub Actions — on the VPS that is the production database')
  }
  return raw
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
