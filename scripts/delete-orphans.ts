#!/usr/bin/env tsx
// Deletes the ORPHANS of the `invoice-files` bucket: objects no invoice row points at and no table mentions.
// Rules, backup and traps: docs/compress-existing.md ("Orphans").
//
//   pnpm exec tsx scripts/delete-orphans.ts                                   dry run: counts, volume, sample — deletes NOTHING (the default)
//   pnpm exec tsx scripts/delete-orphans.ts --delete --expect-count 678 --expect-mb 115
//
// --delete refuses to run without --expect-count and --expect-mb: the numbers come from a dry run, and if the bucket
// no longer matches them (±5% count, ±10% volume) NOTHING is deleted and the run stops. Before the first delete every
// orphan is copied to a backup that is packed, extracted and hash-checked; the backup directory is KEPT (it is removed
// by a one-off timer after 7 days, set up by hand — this script never deletes its own backup).
import { mkdir, writeFile } from 'node:fs/promises'
import { setPriority } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BackupSession } from '../src/lib/compress/backup'
import { loadEnv, readRows } from '../src/lib/compress/cli'
import { sniffKind } from '../src/lib/compress/decision'
import { findMentions } from '../src/lib/compress/orphan-refs'
import { baseName, checkExpectation, planOrphans, sumBytes, sweepOrphans } from '../src/lib/compress/orphans'
import { fmtBytes } from '../src/lib/compress/report'
import { planEntries } from '../src/lib/compress/run'
import { createReadStore, createRemoveStore } from '../src/lib/compress/supabase-store'

const out = (s: string) => process.stdout.write(`${s}\n`)
const err = (s: string) => process.stderr.write(`${s}\n`)

interface Args {
  del: boolean
  expectCount: number | null
  expectMb: number | null
  minAgeHours: number
  report: string | null
  envFile: string
  backupDir: string
}

function parse(argv: string[], defaults: { envFile: string; backupDir: string }): Args {
  const a: Args = { del: false, expectCount: null, expectMb: null, minAgeHours: 24, report: null, envFile: defaults.envFile, backupDir: defaults.backupDir }
  const val = (i: number, f: string) => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${f} needs a value`)
    return v
  }
  const num = (s: string, f: string) => {
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${f} must be a positive number`)
    return n
  }
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]!
    if (f === '--delete') a.del = true
    else if (f === '--expect-count') a.expectCount = num(val(i++, f), f)
    else if (f === '--expect-mb') a.expectMb = num(val(i++, f), f)
    else if (f === '--min-age-hours') a.minAgeHours = num(val(i++, f), f)
    else if (f === '--report') a.report = val(i++, f)
    else if (f === '--env-file') a.envFile = resolve(val(i++, f))
    else if (f === '--backup-dir') a.backupDir = resolve(val(i++, f))
    else throw new Error(`unknown flag ${f}`)
  }
  if (a.del && (a.expectCount === null || a.expectMb === null)) throw new Error('--delete needs --expect-count and --expect-mb (take them from a dry run)')
  return a
}

async function main(): Promise<number> {
  const args = parse(process.argv.slice(2), { envFile: fileURLToPath(new URL('../.env.local', import.meta.url)), backupDir: '/var/backups/invoice-precompress' })
  out(args.del ? '=== DELETE ORPHANS — objects WILL be removed from the bucket (after a verified backup) ===' : '=== DRY-RUN — nothing is deleted, nothing is written ===')
  setPriority(process.pid, 19)

  const env = await loadEnv(args.envFile)
  const reader = createReadStore(env.supabaseUrl, env.serviceKey)
  const rows = await readRows(env.dbUrl)
  const listing = await reader.list()
  const { entries } = planEntries(rows, listing)
  const referenced = new Set(entries.map((e) => e.path))
  const candidates = listing.filter((o) => !referenced.has(o.path))
  const mentioned = await findMentions(env.dbUrl, candidates.map((o) => baseName(o.path)))
  const plan = planOrphans(listing, referenced, mentioned, new Date(), args.minAgeHours * 3_600_000)

  const total = sumBytes(listing)
  out(`bucket: ${listing.length} objects, ${fmtBytes(total)} · referenced by an invoice row: ${referenced.size}`)
  out(`not referenced: ${plan.candidates} → mentioned elsewhere in the database (KEPT): ${plan.mentioned.length} · younger than ${args.minAgeHours}h or of unknown age (KEPT): ${plan.tooRecent.length}`)
  out(`ORPHANS: ${plan.orphans.length} objects, ${fmtBytes(sumBytes(plan.orphans))} (${plan.orphans.length ? ((sumBytes(plan.orphans) / total) * 100).toFixed(1) : '0'}% of the bucket)`)
  const byPrefix = new Map<string, { n: number; b: number }>()
  for (const o of plan.orphans) {
    const k = o.path.includes('/') ? o.path.slice(0, o.path.indexOf('/') + 1) : '(root)'
    const cur = byPrefix.get(k) ?? { n: 0, b: 0 }
    byPrefix.set(k, { n: cur.n + 1, b: cur.b + o.size })
  }
  for (const [k, v] of byPrefix) out(`  ${k.padEnd(22)} ${String(v.n).padStart(5)} objects  ${fmtBytes(v.b)}`)
  const kinds = new Map<string, number>()
  for (const o of plan.orphans.slice(0, 40)) kinds.set(o.mime ?? 'no mime', (kinds.get(o.mime ?? 'no mime') ?? 0) + 1)
  out(`  Content-Types (first 40): ${[...kinds].map(([k, n]) => `${k} ×${n}`).join(', ')}`)
  out('  sample: ' + plan.orphans.slice(0, 3).map((o) => `${o.path} (${fmtBytes(o.size)}, ${o.createdAt ?? '?'})`).join(' | '))

  if (args.report) {
    await mkdir(resolve(args.report, '..'), { recursive: true })
    await writeFile(`${args.report}.json`, JSON.stringify({ total: listing.length, referenced: referenced.size, plan: { candidates: plan.candidates, mentioned: plan.mentioned.map((o) => o.path), tooRecent: plan.tooRecent.map((o) => o.path), orphans: plan.orphans } }, null, 1))
    out(`report: ${args.report}.json`)
  }

  if (args.expectCount !== null && args.expectMb !== null) {
    const problem = checkExpectation(plan, { count: args.expectCount, bytes: args.expectMb * 1048576 })
    if (problem) {
      err(`\nSTOP — the bucket does not match the expectation: ${problem}. Nothing was deleted.`)
      return 3
    }
    out('expectation met (count and volume within tolerance)')
  }
  if (!args.del) return 0
  if (plan.orphans.length === 0) {
    out('nothing to delete')
    return 0
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z')
  const backup = new BackupSession(join(args.backupDir, `orphans-${stamp}`))
  out(`backup: ${backup.root}`)
  const res = await sweepOrphans(plan.orphans, {
    reader,
    remover: createRemoveStore(env.supabaseUrl, env.serviceKey),
    backup,
    concurrency: 4,
    onProgress: (phase, done, n) => {
      if (done % 100 === 0 || done === n) err(`  ${phase} ${done}/${n}`)
    },
  })
  out(`backed up ${res.backedUp} · removed ${res.removed}`)

  // Verification, from a fresh listing: they are gone, the count and the weight are exactly what they should be,
  // and a sample of REFERENCED objects still downloads intact (right size, right magic number).
  const after = await reader.list()
  const gone = new Set(plan.orphans.map((o) => o.path))
  const still = after.filter((o) => gone.has(o.path))
  const countOk = after.length === listing.length - plan.orphans.length
  const bytesOk = sumBytes(after) === total - sumBytes(plan.orphans)
  out(`after: ${after.length} objects, ${fmtBytes(sumBytes(after))} · orphans still listed: ${still.length} · count = before − deleted: ${countOk} · bytes = before − deleted: ${bytesOk}`)
  const pool = entries.slice()
  const sample = Array.from({ length: Math.min(5, pool.length) }, () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!)
  let sampleOk = true
  for (const e of sample) {
    const b = await reader.download(e.path)
    const kind = sniffKind(b)
    const ok = b.length === e.object.size && (kind === 'pdf' || kind === 'jpeg')
    sampleOk &&= ok
    out(`  sample ${e.path}: ${b.length} bytes, ${kind} → ${ok ? 'ok' : 'PROBLEM'}`)
  }
  const backupFile = join(backup.root, 'originals.tar.gz')
  out(`backup kept: ${backupFile} (remove it after 7 days)`)
  return still.length === 0 && countOk && bytesOk && sampleOk ? 0 : 1
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    err(`delete-orphans failed: ${e instanceof Error ? e.message : 'error'}`)
    process.exit(1)
  },
)
