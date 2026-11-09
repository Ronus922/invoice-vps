import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { READ_ONLY_PGOPTIONS, ROWS_SQL, loadEnv, parseArgs, readRows, type Exec } from '@/lib/compress/cli'
import { seconds } from '@/lib/compress/supabase-store'

const defaults = { envFile: '/repo/.env.local', backupDir: '/var/backups/invoice-precompress' }
const parse = (...argv: string[]) => parseArgs(argv, defaults)

describe('parseArgs — the safety rails of the command line', () => {
  it('the retired --text-image-dpi flag is refused, not silently ignored (text PDFs are no longer compressed at all)', () => {
    expect(() => parse('--text-image-dpi', '150')).toThrow(/unknown flag --text-image-dpi/)
  })
  it('the default is a dry run over everything: nothing to apply, no limit', () => {
    expect(parse()).toMatchObject({ apply: false, all: false, limit: null, keepBackup: false, concurrency: 4, report: null, ...defaults })
  })
  it('--apply on its own is REFUSED: a replacement needs --limit N or --all, so a full run is never an accident', () => {
    expect(() => parse('--apply')).toThrow(/--apply needs --limit N or --all/)
    expect(parse('--apply', '--limit', '20')).toMatchObject({ apply: true, limit: 20, all: false })
    expect(parse('--apply', '--all')).toMatchObject({ apply: true, all: true, limit: null })
  })
  it('contradictory or meaningless combinations are refused', () => {
    expect(() => parse('--dry-run', '--apply', '--all')).toThrow(/mutually exclusive/)
    expect(() => parse('--apply', '--all', '--limit', '5')).toThrow(/--all and --limit are mutually exclusive/)
    expect(() => parse('--all')).toThrow(/--all only makes sense with --apply/)
    expect(() => parse('--keep-backup')).toThrow(/--keep-backup only makes sense with --apply/)
    expect(parse('--apply', '--limit', '3', '--keep-backup').keepBackup).toBe(true)
  })
  it('numbers must be positive integers and every value flag needs its value', () => {
    for (const bad of [['--limit', '0'], ['--limit', '-3'], ['--limit', '2.5'], ['--limit', 'abc'], ['--concurrency', '0']]) expect(() => parse(...bad)).toThrow(/positive integer/)
    expect(() => parse('--limit')).toThrow(/--limit needs a value/)
    expect(() => parse('--limit', '--apply')).toThrow(/--limit needs a value/)
    expect(() => parse('--report')).toThrow(/--report needs a value/)
  })
  it('unknown flags are refused (a typo must not silently mean "dry run")', () => {
    expect(() => parse('--aply')).toThrow(/unknown flag --aply/)
  })
  it('reads the optional flags', () => {
    expect(parse('--limit', '20', '--concurrency', '2', '--report', '/tmp/r', '--env-file', '/x/.env', '--backup-dir', '/b')).toMatchObject({
      limit: 20, concurrency: 2, report: '/tmp/r', envFile: '/x/.env', backupDir: '/b',
    })
  })
})

describe('readRows — how the database is read', () => {
  const ok: Exec = async () => ({ stdout: JSON.stringify([{ id: 'a', source: 'gmail', fileUrl: 'u', fileName: null }]) + '\n' })

  it('is a READ-ONLY session (enforced by the server) running ONE select, quiet (-X -At)', async () => {
    const seen: Array<{ file: string; args: string[]; env: Readonly<Record<string, string | undefined>> }> = []
    await readRows('postgres://u:p@h/db', async (file, args, env) => { seen.push({ file, args, env }); return ok(file, args, env) }, { PATH: '/bin' })
    expect(seen).toHaveLength(1)
    expect(seen[0]!.file).toBe('psql')
    expect(seen[0]!.args).toEqual(['postgres://u:p@h/db', '-X', '-At', '-c', ROWS_SQL])
    expect(seen[0]!.env.PGOPTIONS).toBe(READ_ONLY_PGOPTIONS)
    expect(READ_ONLY_PGOPTIONS).toContain('default_transaction_read_only=on')
    expect(seen[0]!.env.PATH).toBe('/bin') // the rest of the environment is passed through
  })
  it('the query is a single SELECT and contains no write keyword', () => {
    expect(ROWS_SQL).toMatch(/^select /)
    expect(ROWS_SQL).not.toMatch(/;/)
    expect(ROWS_SQL).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy)\b/i)
  })
  it('returns the rows, and an empty table is an empty list', async () => {
    expect(await readRows('x', ok)).toEqual([{ id: 'a', source: 'gmail', fileUrl: 'u', fileName: null }])
    expect(await readRows('x', async () => ({ stdout: '[]\n' }))).toEqual([])
  })
  it('a failure never prints the connection string — not the password, not the host', async () => {
    const boom: Exec = async () => {
      throw Object.assign(new Error('Command failed: psql postgres://admin:hunter2@db.internal:5432/app -X'), { stderr: 'psql: error: connection to postgresql://admin:hunter2@db.internal:5432/app failed: timeout\nmore' })
    }
    const err = await readRows('postgres://admin:hunter2@db.internal:5432/app', boom).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('database read failed: psql: error: connection to <db-url> failed: timeout')
    expect((err as Error).message).not.toMatch(/hunter2|db\.internal/)
  })
  it('output that is not the expected JSON is an error, not a crash with a stack of the data', async () => {
    await expect(readRows('x', async () => ({ stdout: 'not json' }))).rejects.toThrow(/^database read failed/)
    await expect(readRows('x', async () => ({ stdout: '[{"id":1}]' }))).rejects.toThrow(/^database read failed/)
  })
})

describe('loadEnv — only three keys leave the env file', () => {
  let dir: string
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'cli-env-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  const write = async (text: string) => {
    const f = join(dir, '.env.local')
    await writeFile(f, text)
    return f
  }

  it('returns the three keys it needs and nothing else (quotes stripped)', async () => {
    const f = await write(['ANTHROPIC_API_KEY=NEVER-read-this-placeholder', 'NEXT_PUBLIC_SUPABASE_URL="https://s.example"', 'SUPABASE_SERVICE_ROLE_KEY=svc', "DIRECT_URL='postgres://u@h/d'", 'CRON_SECRET=also-never'].join('\n'))
    const env = await loadEnv(f, {})
    expect(env).toEqual({ supabaseUrl: 'https://s.example', serviceKey: 'svc', dbUrl: 'postgres://u@h/d' })
    expect(JSON.stringify(env)).not.toMatch(/NEVER/)
  })
  it('a missing key is named — and no value from the file appears in the message', async () => {
    const f = await write(['NEXT_PUBLIC_SUPABASE_URL=https://s.example', 'DIRECT_URL=postgres://u:pw-in-url@h/d'].join('\n'))
    const err = await loadEnv(f, {}).catch((e: Error) => e)
    expect((err as Error).message).toMatch(/SUPABASE_SERVICE_ROLE_KEY is missing/)
    expect((err as Error).message).not.toMatch(/pw-in-url|s\.example/)
  })
  it('falls back to the process environment for a key the file does not have', async () => {
    const f = await write('NEXT_PUBLIC_SUPABASE_URL=https://s.example\nDIRECT_URL=postgres://u@h/d')
    expect((await loadEnv(f, { SUPABASE_SERVICE_ROLE_KEY: 'from-env' })).serviceKey).toBe('from-env')
  })
})

describe('seconds — Cache-Control as storage-js wants it', () => {
  it('extracts max-age, and falls back to the bucket default instead of "undefined"', () => {
    expect(seconds('max-age=3600')).toBe('3600')
    expect(seconds('public, max-age=60')).toBe('60')
    expect(seconds(null)).toBe('3600')
    expect(seconds('no-cache')).toBe('3600')
  })
})
