import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, mkdtemp, open, readFile, rm, statfs } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize } from 'node:path'
import { promisify } from 'node:util'

// The temporary safety copy for --apply: every original is written to disk BEFORE its object is replaced,
// the originals are then packed into one tar.gz, the archive is proven readable (extracted and hashed against
// the manifest), and the whole backup is deleted automatically — but only when the caller says the replacements
// passed THEIR integrity check too (dispose). Any failure upstream leaves the directory exactly as it is.
//
// Nothing in this file runs in a dry run: BackupSession is built by the --apply path only.

const run = promisify(execFile)

export const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

export interface ManifestEntry {
  path: string
  sha256: string
  bytes: number
}

/** A bucket object path becomes a path under `files/`. Anything that could climb out of it is refused. */
export function stagedPath(objectPath: string): string {
  const clean = normalize(objectPath)
  if (!objectPath || isAbsolute(objectPath) || clean.startsWith('..') || clean.split('/').includes('..') || objectPath.includes('\0')) {
    throw new Error('backup_bad_path')
  }
  return join('files', clean)
}

export class BackupSession {
  private readonly manifest: ManifestEntry[] = []

  constructor(readonly root: string) {}

  get tarPath(): string {
    return join(this.root, 'originals.tar.gz')
  }

  async init(): Promise<void> {
    await mkdir(join(this.root, 'files'), { recursive: true, mode: 0o700 })
  }

  /** Creates the directory and checks there is room — BEFORE anything is read or replaced, so a backup location that
   *  cannot be written (the default /var/backups is root-owned) fails the run at the start, not at the first file.
   *  Needs `bytes` (the originals, at worst) twice over: loose copies, then the tar.gz next to them. */
  async preflight(bytes: number): Promise<void> {
    try {
      await this.init()
    } catch (err) {
      throw new Error(`backup directory ${this.root} cannot be created (${err instanceof Error ? err.message.split(',')[0] : 'error'}) — create it once with: sudo install -d -o $(id -un) -m 700 ${dirname(this.root)}`)
    }
    const fs = await statfs(this.root)
    const free = Number(fs.bavail) * Number(fs.bsize)
    if (free < bytes * 2 + 256 * 1024 * 1024) throw new Error(`backup directory ${this.root} has ${Math.round(free / 1048576)}MB free; needs about ${Math.round((bytes * 2) / 1048576) + 256}MB`)
  }

  /** Writes one original to disk and records its hash. Throws when it cannot — the caller must NOT replace the object then. */
  async stage(objectPath: string, bytes: Buffer): Promise<ManifestEntry> {
    const target = join(this.root, stagedPath(objectPath))
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    const fh = await open(target, 'w', 0o600)
    try {
      await fh.writeFile(bytes)
      await fh.sync() // on disk before the object it protects is touched
    } finally {
      await fh.close()
    }
    const back = await readFile(target)
    const entry: ManifestEntry = { path: objectPath, sha256: sha256(bytes), bytes: bytes.length }
    if (sha256(back) !== entry.sha256) throw new Error('backup_write_mismatch')
    this.manifest.push(entry)
    await appendFile(join(this.root, 'manifest.jsonl'), `${JSON.stringify(entry)}\n`, { mode: 0o600 })
    return entry
  }

  get staged(): readonly ManifestEntry[] {
    return this.manifest
  }

  /** Packs `files/` + the manifest into originals.tar.gz and PROVES the archive: it is extracted into a scratch
   *  directory and every file is hashed against the manifest. Returns null when the archive is sound. */
  async archive(): Promise<string | null> {
    try {
      await run('tar', ['-czf', this.tarPath, '-C', this.root, 'files', 'manifest.jsonl'])
      const scratch = await mkdtemp(join(this.root, 'verify-'))
      try {
        await run('tar', ['-xzf', this.tarPath, '-C', scratch])
        for (const e of this.manifest) {
          const got = await readFile(join(scratch, stagedPath(e.path))).catch(() => null)
          if (!got || got.length !== e.bytes || sha256(got) !== e.sha256) return `archive does not contain an intact ${e.path}`
        }
      } finally {
        await rm(scratch, { recursive: true, force: true })
      }
      await rm(join(this.root, 'files'), { recursive: true, force: true }) // the tar.gz now holds them
      return null
    } catch (err) {
      return `archive failed: ${err instanceof Error ? err.message.split('\n')[0] : 'error'}`
    }
  }

  /** Deletes the whole backup. Called ONLY after the replacements passed their integrity check. */
  async dispose(): Promise<void> {
    await rm(this.root, { recursive: true, force: true })
  }
}
