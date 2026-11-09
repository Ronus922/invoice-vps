import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BackupSession, sha256 } from '@/lib/compress/backup'
import { columnsWithHitsSql, escapeRegex, findMentions, matchedNamesSql, mentionPattern } from '@/lib/compress/orphan-refs'
import { baseName, checkExpectation, chunk, planOrphans, sweepOrphans } from '@/lib/compress/orphans'
import type { ReadStore, StoredObject } from '@/lib/compress/run'
import type { RemoveStore } from '@/lib/compress/supabase-store'

const NOW = new Date('2026-11-09T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
const obj = (path: string, size = 100, createdAt: string | null = hoursAgo(72)): StoredObject => ({ path, size, mime: 'application/pdf', cacheControl: 'max-age=3600', createdAt })

describe('planOrphans — what may be deleted', () => {
  const listing = [
    obj('invoices/ref.pdf'), // an invoice row points at it
    obj('invoices/orphan.pdf'),
    obj('invoices/mentioned.pdf'), // no row points at it, but a table mentions the name
    obj('invoices/fresh.pdf', 100, hoursAgo(2)), // uploaded two hours ago
    obj('invoices/unknown-age.pdf', 100, null),
    obj('invoices/day-old.pdf', 100, hoursAgo(24)), // exactly 24h: old enough
  ]
  const plan = planOrphans(listing, new Set(['invoices/ref.pdf']), new Set(['mentioned.pdf']), NOW)

  it('only an unreferenced, unmentioned object that is at least 24h old is an orphan', () => {
    expect(plan.orphans.map((o) => o.path)).toEqual(['invoices/orphan.pdf', 'invoices/day-old.pdf'])
  })
  it('a name mentioned by ANY table is kept, however unreferenced by invoices', () => {
    expect(plan.mentioned.map((o) => o.path)).toEqual(['invoices/mentioned.pdf'])
  })
  it('a young object, or one whose age cannot be proven, is kept', () => {
    expect(plan.tooRecent.map((o) => o.path)).toEqual(['invoices/fresh.pdf', 'invoices/unknown-age.pdf'])
  })
  it('a referenced object is not even a candidate', () => {
    expect(plan.candidates).toBe(5)
  })
  it('the minimum age is a parameter', () => {
    expect(planOrphans(listing, new Set(['invoices/ref.pdf']), new Set(), NOW, 1000 * 3600).orphans.map((o) => o.path)).toContain('invoices/fresh.pdf')
  })
})

describe('checkExpectation — stop when the bucket is not what the dry run saw', () => {
  const plan = (n: number, size: number) => planOrphans(Array.from({ length: n }, (_, i) => obj(`invoices/o${i}.pdf`, size)), new Set(), new Set(), NOW)
  it('within tolerance → null', () => {
    expect(checkExpectation(plan(678, 170_000), { count: 678, bytes: 678 * 170_000 })).toBeNull()
    expect(checkExpectation(plan(700, 170_000), { count: 678, bytes: 678 * 170_000 })).toBeNull() // +3%
  })
  it('the count off by more than 5% → a problem that says so', () => {
    expect(checkExpectation(plan(500, 170_000), { count: 678, bytes: 500 * 170_000 })).toMatch(/500 orphans, expected about 678/)
  })
  it('the volume off by more than 10% → a problem that says so', () => {
    expect(checkExpectation(plan(678, 300_000), { count: 678, bytes: 678 * 170_000 })).toMatch(/MB, expected about/)
  })
})

describe('chunk', () => {
  it('splits in order, the last chunk is the remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
  })
})

describe('the database question', () => {
  it('escapes everything that is special in a regular expression, and nothing else', () => {
    expect(escapeRegex('a.b(c)+d[1]{2}^$|*?\\')).toBe('a\\.b\\(c\\)\\+d\\[1\\]\\{2\\}\\^\\$\\|\\*\\?\\\\')
    expect(escapeRegex('0189426c-720b.pdf')).toBe('0189426c-720b\\.pdf')
  })
  it('looks for the plain name and its percent-encoded spelling', () => {
    expect(mentionPattern(['a b.pdf'])).toBe('(a b\\.pdf|a%20b\\.pdf)')
    expect(mentionPattern(['x.pdf', 'x.pdf'])).toBe('(x\\.pdf)')
  })
  it('the SQL only reads: counts per column, then matched names; quotes are doubled so a name cannot break out', () => {
    const p = mentionPattern(["o'brien.pdf"])
    const a = columnsWithHitsSql(p)
    const b = matchedNamesSql(p, [{ table: 'inv"oices', column: 'file_url' }])
    for (const sql of [a, b]) expect(sql).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate|grant)\b/i)
    expect(a).toContain("o''brien")
    expect(b).toContain('"inv""oices"')
    expect(b).toContain("regexp_matches(\"file_url\"::text")
  })
  it('asks in read-only mode, in groups, and maps matches back to the plain names', async () => {
    const calls: Array<{ args: string[]; pgoptions: string | undefined }> = []
    const exec = async (_f: string, args: string[], env: Readonly<Record<string, string | undefined>>) => {
      calls.push({ args, pgoptions: env.PGOPTIONS })
      const sql = args[args.length - 1]!
      if (sql.includes('information_schema')) return { stdout: 'invoices|file_url\n' }
      return { stdout: 'a%20b.pdf\nkept.pdf\n' } // one hit percent-encoded, one plain
    }
    const found = await findMentions('postgres://secret@host/db', ['a b.pdf', 'kept.pdf', 'other.pdf'], exec, {})
    expect([...found].sort()).toEqual(['a b.pdf', 'kept.pdf'])
    expect(calls.every((c) => c.pgoptions?.includes('default_transaction_read_only=on'))).toBe(true)
  })
  it('a database error stops the sweep and never prints the connection string', async () => {
    const exec = async () => { throw Object.assign(new Error('boom'), { stderr: 'psql: error: connection to postgres://user:pw@host/db failed' }) }
    const err = await findMentions('postgres://user:pw@host/db', ['a.pdf'], exec, {}).catch((e: Error) => e)
    expect((err as Error).message).toContain('<db-url>')
    expect((err as Error).message).not.toContain('pw@')
  })
})

describe('sweepOrphans — backup first, delete second', () => {
  let dir: string
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'orphan-test-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  class Mem implements ReadStore, RemoveStore {
    readonly files = new Map<string, Buffer>()
    readonly removeCalls: string[][] = []
    failDownload = new Set<string>()
    async list() { return [...this.files].map(([path, b]) => ({ path, size: b.length, mime: null, cacheControl: null })) }
    async download(path: string) {
      if (this.failDownload.has(path)) throw new Error('fetch failed')
      const b = this.files.get(path)
      if (!b) throw new Error('not found')
      return b
    }
    async remove(paths: string[]) { this.removeCalls.push(paths); for (const p of paths) this.files.delete(p) }
  }
  const setup = (n: number) => {
    const m = new Mem()
    const orphans: StoredObject[] = []
    for (let i = 0; i < n; i++) {
      const b = Buffer.from(`orphan-${i}-`.padEnd(40 + i, 'x'))
      m.files.set(`invoices/o${i}.pdf`, b)
      orphans.push(obj(`invoices/o${i}.pdf`, b.length))
    }
    m.files.set('invoices/keep.pdf', Buffer.from('keep me'))
    return { m, orphans }
  }

  it('backs every orphan up (hash-checked archive), then removes them in batches — and nothing else', async () => {
    const { m, orphans } = setup(7)
    const backup = new BackupSession(join(dir, 'b'))
    const res = await sweepOrphans(orphans, { reader: m, remover: m, backup, concurrency: 3, batchSize: 3 })
    expect(res).toMatchObject({ backedUp: 7, removed: 7 })
    expect(m.removeCalls.map((c) => c.length)).toEqual([3, 3, 1])
    expect([...m.files.keys()]).toEqual(['invoices/keep.pdf'])
    expect((await stat(join(backup.root, 'originals.tar.gz'))).size).toBeGreaterThan(0)
    const manifest = (await readFile(join(backup.root, 'manifest.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as { path: string; sha256: string })
    expect(manifest).toHaveLength(7)
    expect(manifest.find((e) => e.path === 'invoices/o0.pdf')!.sha256).toBe(sha256(Buffer.from('orphan-0-'.padEnd(40, 'x'))))
  })
  it('one orphan that cannot be downloaded → NOTHING is deleted', async () => {
    const { m, orphans } = setup(4)
    m.failDownload.add('invoices/o2.pdf')
    await expect(sweepOrphans(orphans, { reader: m, remover: m, backup: new BackupSession(join(dir, 'b')), concurrency: 2 })).rejects.toThrow('fetch failed')
    expect(m.removeCalls).toEqual([])
    expect(m.files.size).toBe(5)
  })
  it('an object whose size differs from the listing is not backed up and stops the sweep before any delete', async () => {
    const { m, orphans } = setup(3)
    orphans[1] = { ...orphans[1]!, size: orphans[1]!.size + 1 }
    await expect(sweepOrphans(orphans, { reader: m, remover: m, backup: new BackupSession(join(dir, 'b')), concurrency: 1 })).rejects.toThrow(/listed .*nothing was deleted/)
    expect(m.removeCalls).toEqual([])
  })
  it('a failing delete call leaves the backup in place and reports how far it got', async () => {
    const { m, orphans } = setup(5)
    let calls = 0
    const remover: RemoveStore = { remove: async (p) => { if (++calls === 2) throw new Error('gateway down'); await m.remove(p) } }
    const backup = new BackupSession(join(dir, 'b'))
    await expect(sweepOrphans(orphans, { reader: m, remover, backup, concurrency: 2, batchSize: 2 })).rejects.toThrow('gateway down')
    expect(m.files.size).toBe(1 + 3) // the first batch (2) went; 3 orphans + keep remain
    expect((await stat(join(backup.root, 'originals.tar.gz'))).size).toBeGreaterThan(0)
  })
  it('baseName is the last path segment', () => {
    expect(baseName('invoices/sub/a b.pdf')).toBe('a b.pdf')
    expect(baseName('x.pdf')).toBe('x.pdf')
  })
})
