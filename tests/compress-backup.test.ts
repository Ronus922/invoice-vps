import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BackupSession, sha256, stagedPath } from '@/lib/compress/backup'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'backup-test-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('stagedPath — an object name can never climb out of the backup', () => {
  it('keeps ordinary object paths under files/', () => {
    expect(stagedPath('invoices/a b.pdf')).toBe(join('files', 'invoices', 'a b.pdf'))
  })
  it('refuses traversal, absolute paths, empty names and NUL', () => {
    for (const bad of ['../x', 'invoices/../../x', '/etc/passwd', '', 'a\0b']) expect(() => stagedPath(bad)).toThrow('backup_bad_path')
  })
})

describe('BackupSession', () => {
  it('stage → archive → the archive is extracted and every file matches its hash', async () => {
    const b = new BackupSession(join(dir, 'run1'))
    await b.init()
    const one = Buffer.from('original one')
    const two = Buffer.from('second original, a little longer')
    await b.stage('invoices/one.pdf', one)
    await b.stage('invoices/two.jpg', two)
    expect(b.staged.map((s) => s.sha256)).toEqual([sha256(one), sha256(two)])

    expect(await b.archive()).toBeNull()
    expect((await stat(b.tarPath)).size).toBeGreaterThan(0)
    // the loose copies are gone once the tar.gz holds them
    expect(await readdir(join(dir, 'run1'))).not.toContain('files')
  })

  it('an original that changed on disk after it was staged is caught by the archive check — even when its length is unchanged', async () => {
    for (const [name, replacement] of [['shorter', 'tampered'], ['same-length', 'the fake bytes']] as const) {
      const b = new BackupSession(join(dir, `run2-${name}`))
      await b.init()
      await b.stage('invoices/one.pdf', Buffer.from('the real bytes')) // 14 bytes; 'the fake bytes' is 14 too
      await writeFile(join(dir, `run2-${name}`, stagedPath('invoices/one.pdf')), replacement)
      expect(await b.archive()).toMatch(/does not contain an intact invoices\/one\.pdf/)
    }
  })

  it('writes a manifest line per staged original', async () => {
    const b = new BackupSession(join(dir, 'run3'))
    await b.init()
    await b.stage('invoices/one.pdf', Buffer.from('x'))
    const lines = (await readFile(join(dir, 'run3', 'manifest.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as { path: string; bytes: number })
    expect(lines).toEqual([expect.objectContaining({ path: 'invoices/one.pdf', bytes: 1 })])
  })

  it('preflight fails at the START, with the fix spelled out, when the backup directory cannot be created', async () => {
    await writeFile(join(dir, 'a-file'), 'x') // a regular file where a directory is needed: ENOTDIR, never created
    const b = new BackupSession(join(dir, 'a-file', 'invoice-precompress', 'run'))
    await expect(b.preflight(1000)).rejects.toThrow(/cannot be created[\s\S]*sudo install -d/)
  })

  it('preflight creates the directory and refuses when there is not enough room (needs the originals twice plus slack)', async () => {
    const b = new BackupSession(join(dir, 'pre'))
    await expect(b.preflight(10)).resolves.toBeUndefined()
    await expect(stat(join(dir, 'pre', 'files'))).resolves.toBeDefined()
    await expect(new BackupSession(join(dir, 'pre2')).preflight(Number.MAX_SAFE_INTEGER / 4)).rejects.toThrow(/free; needs about/)
  })

  it('dispose deletes the whole backup', async () => {
    const b = new BackupSession(join(dir, 'run4'))
    await b.init()
    await b.stage('invoices/one.pdf', Buffer.from('x'))
    await b.dispose()
    await expect(stat(join(dir, 'run4'))).rejects.toThrow()
  })
})
