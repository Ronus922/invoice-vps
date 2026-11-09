#!/usr/bin/env tsx
// Retroactive compression of the files already stored in the `invoice-files` bucket. Full explanation of the
// rules, the decisions behind them and the traps: docs/compress-existing.md.
//
//   pnpm exec tsx scripts/compress-existing.ts                      dry run on every file (the default — writes NOTHING)
//   pnpm exec tsx scripts/compress-existing.ts --limit 20           dry run on a 20-file sample across file types
//   pnpm exec tsx scripts/compress-existing.ts --apply --limit 20   REPLACES up to 20 objects (needs Ronen's go-ahead)
//   pnpm exec tsx scripts/compress-existing.ts --apply --all        REPLACES every qualifying object
//
// A dry run: reads the invoices table through a READ-ONLY database session, lists and DOWNLOADS objects from
// Storage, compresses in memory, measures, checks integrity — and never uploads, removes or updates anything.
// The dry run is handed no write client at all (src/lib/compress/supabase-store.ts builds one only for --apply).
//
// Flags:  --dry-run (default)  --apply  --limit N  --all  --keep-backup  --concurrency N
//         --report FILE (writes FILE.json and FILE.tsv)  --env-file FILE  --backup-dir DIR
import { mkdir, writeFile } from 'node:fs/promises'
import { setPriority } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BackupSession } from '../src/lib/compress/backup'
import { loadEnv, parseArgs, readRows } from '../src/lib/compress/cli'
import { popplerStatus } from '../src/lib/compress/pdf-verify'
import { describe, fmtBytes, notReplaced, renderSkipReasons, renderSummary, summaryOf, toTsv, topSavings } from '../src/lib/compress/report'
import { finishApply, planEntries, realEngines, runCompression, type ApplyContext } from '../src/lib/compress/run'
import { retryStats } from '../src/lib/compress/retry'
import { createReadStore, createWriteStore } from '../src/lib/compress/supabase-store'

const out = (s: string) => process.stdout.write(`${s}\n`)
const err = (s: string) => process.stderr.write(`${s}\n`)

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2), { envFile: fileURLToPath(new URL('../.env.local', import.meta.url)), backupDir: '/var/backups/invoice-precompress' })
  const mode = args.apply ? 'APPLY' : 'DRY-RUN'
  out(args.apply ? '=== APPLY — objects in the bucket WILL be replaced (originals are backed up first) ===' : '=== DRY-RUN — nothing is written to Storage or to the database ===')
  setPriority(process.pid, 19) // a shared production VPS: this is the lowest-priority thing on it

  const poppler = await popplerStatus()
  if (!poppler.ok) {
    err(`Refusing to run: poppler tools missing (${poppler.missing.join(', ')}). The integrity check needs them; it is never skipped.`)
    return 2
  }

  const env = await loadEnv(args.envFile)
  const reader = createReadStore(env.supabaseUrl, env.serviceKey)
  const rows = await readRows(env.dbUrl)
  const listing = await reader.list()
  const { entries, unresolved } = planEntries(rows, listing)
  const orphans = listing.length - entries.length
  out(`invoices with a file: ${rows.length} · objects in the bucket: ${listing.length} (${fmtBytes(listing.reduce((s, o) => s + o.size, 0))}) · referenced objects: ${entries.length} · rows whose object is missing: ${unresolved.length} · objects no row points at (never touched): ${orphans}`)

  let apply: ApplyContext | undefined
  if (args.apply) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z')
    const backup = new BackupSession(join(args.backupDir, stamp))
    await backup.preflight(entries.reduce((s, e) => s + e.object.size, 0)) // before a single object is touched
    apply = { writer: createWriteStore(env.supabaseUrl, env.serviceKey), backup }
    out(`backup of originals: ${backup.root}`)
    process.on('SIGINT', () => {
      err(`\ninterrupted. Anything already replaced has its original in ${backup.root} (files/ or originals.tar.gz).`)
      process.exit(130)
    })
  }

  const started = Date.now()
  let result
  try {
    result = await runCompression(entries, reader, realEngines(), {
      limit: args.limit,
      concurrency: args.concurrency,
      onProgress: (done, total) => {
        if (done % 50 === 0 || done === total) err(`  ${done}/${total}  (${Math.round((Date.now() - started) / 1000)}s)`)
      },
    }, apply)
  } catch (e) {
    if (apply) err(`\nAPPLY stopped: ${e instanceof Error ? e.message : 'error'}\nThe backup is KEPT at ${apply.backup.root} — every object replaced so far has its original there.`)
    throw e
  }

  const summary = summaryOf(result.reports)
  out(`\n${mode}: examined ${result.examined} of ${result.planned} objects${args.limit !== null ? ` (sample of ${args.limit} from ${result.eligible} that a rule lets us touch)` : ''} in ${Math.round((Date.now() - started) / 1000)}s\n`)
  out(renderSummary(summary))
  out(`\nSkipped, by reason:\n${renderSkipReasons(summary)}`)
  out('\nBiggest savings:')
  for (const r of topSavings(result.reports, 5)) out(`  ${describe(r)}`)
  out('\nSkipped / failed worth a look:')
  for (const r of notReplaced(result.reports, 5)) out(`  ${describe(r)}`)

  out(`\nStorage calls that needed a retry: ${retryStats.retried} · calls that failed even after 5 tries: ${retryStats.gaveUp}`)

  // The report is written BEFORE the backup is judged: it is the list of exactly which objects were replaced.
  if (args.report) {
    await mkdir(resolve(args.report, '..'), { recursive: true })
    await writeFile(`${args.report}.json`, JSON.stringify({ mode, examined: result.examined, planned: result.planned, summary, reports: result.reports }, null, 1))
    await writeFile(`${args.report}.tsv`, toTsv(result.reports))
    out(`\nreport: ${args.report}.json / .tsv`)
  }

  let exit = 0
  if (apply) {
    const outcome = await finishApply(apply, result.reports, reader, { keepBackup: args.keepBackup })
    if (outcome.problem) {
      err(`\nAPPLY did not finish cleanly: ${outcome.problem}\nThe backup is KEPT at ${outcome.backupPath}`)
      exit = 1
    } else if (outcome.backupDeleted) {
      out(`\nAll replacements read back identical; the backup was deleted (${outcome.backupPath}).`)
    } else {
      out(`\nAll replacements read back identical. The backup was KEPT as requested: ${outcome.backupPath}/originals.tar.gz`)
    }
  }
  return exit
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    err(`compress-existing failed: ${e instanceof Error ? e.message : 'error'}`)
    process.exit(1)
  },
)
