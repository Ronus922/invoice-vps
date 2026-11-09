import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import type { InvoiceRow } from './run'

// The safety rails of scripts/compress-existing.ts, kept in a module so they can be tested: which flag
// combinations are refused, which keys are taken from the env file, and exactly how the database is read.

export interface Args {
  apply: boolean
  all: boolean
  limit: number | null
  concurrency: number
  report: string | null
  envFile: string
  backupDir: string
  keepBackup: boolean
}

export function parseArgs(argv: readonly string[], defaults: { envFile: string; backupDir: string }): Args {
  const a: Args = { apply: false, all: false, limit: null, concurrency: 4, report: null, envFile: defaults.envFile, backupDir: defaults.backupDir, keepBackup: false }
  let dry = false
  const value = (i: number, flag: string): string => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`)
    return v
  }
  const positive = (s: string, flag: string): number => {
    const n = Number(s)
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} must be a positive integer`)
    return n
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!
    if (flag === '--dry-run') dry = true
    else if (flag === '--apply') a.apply = true
    else if (flag === '--all') a.all = true
    else if (flag === '--keep-backup') a.keepBackup = true
    else if (flag === '--limit') a.limit = positive(value(i++, flag), flag)
    else if (flag === '--concurrency') a.concurrency = positive(value(i++, flag), flag)
    else if (flag === '--report') a.report = value(i++, flag)
    else if (flag === '--env-file') a.envFile = resolve(value(i++, flag))
    else if (flag === '--backup-dir') a.backupDir = resolve(value(i++, flag))
    else throw new Error(`unknown flag ${flag}`)
  }
  if (dry && a.apply) throw new Error('--dry-run and --apply are mutually exclusive')
  if (a.apply && !a.all && a.limit === null) throw new Error('--apply needs --limit N or --all (a full replacement is never the default)')
  if (a.all && !a.apply) throw new Error('--all only makes sense with --apply (a dry run is already over everything)')
  if (a.all && a.limit !== null) throw new Error('--all and --limit are mutually exclusive')
  if (a.keepBackup && !a.apply) throw new Error('--keep-backup only makes sense with --apply')
  return a
}

/** What `process.env` is, without the app's own required keys that Next's types add to NodeJS.ProcessEnv. */
type EnvVars = Readonly<Record<string, string | undefined>>

export interface Env {
  supabaseUrl: string
  serviceKey: string
  dbUrl: string
}

/** Takes ONLY the three keys this script needs from the env file; values are never printed, and an error names the key,
 *  never what was (or was not) in it. */
export async function loadEnv(file: string, fallback: EnvVars = process.env): Promise<Env> {
  const want = new Set(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DIRECT_URL'])
  const got = new Map<string, string>()
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && want.has(m[1]!)) got.set(m[1]!, m[2]!.replace(/^["']|["']$/g, ''))
  }
  const need = (k: string): string => {
    const v = got.get(k) ?? fallback[k]
    if (!v) throw new Error(`${k} is missing (looked in ${file} and the environment)`)
    return v
  }
  return { supabaseUrl: need('NEXT_PUBLIC_SUPABASE_URL'), serviceKey: need('SUPABASE_SERVICE_ROLE_KEY'), dbUrl: need('DIRECT_URL') }
}

/** The database session is READ-ONLY on the server side: even a typo in the query could not write. */
export const READ_ONLY_PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=60000'

/** ONE select. Rows that have a file; nothing else is read. */
export const ROWS_SQL = `select coalesce(json_agg(json_build_object('id', id, 'source', source, 'fileUrl', file_url, 'fileName', file_name) order by created_at), '[]'::json) from public.invoices where file_url is not null`

export type Exec = (file: string, args: string[], env: EnvVars) => Promise<{ stdout: string }>

const run = promisify(execFile)
const realExec: Exec = (file, args, env) => run(file, args, { env: env as NodeJS.ProcessEnv, maxBuffer: 64 * 1024 * 1024 })

const RowSchema = z.array(z.object({ id: z.string(), source: z.string().nullable(), fileUrl: z.string(), fileName: z.string().nullable() }))

export async function readRows(dbUrl: string, exec: Exec = realExec, baseEnv: EnvVars = process.env): Promise<InvoiceRow[]> {
  try {
    const { stdout } = await exec('psql', [dbUrl, '-X', '-At', '-c', ROWS_SQL], { ...baseEnv, PGOPTIONS: READ_ONLY_PGOPTIONS })
    return RowSchema.parse(JSON.parse(stdout.trim()))
  } catch (e) {
    // The failure text of execFile contains the command line — i.e. the connection string. Never print it.
    const stderr = e instanceof Error && 'stderr' in e ? String((e as { stderr: unknown }).stderr) : ''
    throw new Error(`database read failed: ${stderr.replace(/postgres(ql)?:\/\/\S+/g, '<db-url>').split('\n')[0] || 'see psql'}`)
  }
}
