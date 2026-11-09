import type { BackupSession } from './backup'
import { mapPool, type ReadStore, type StoredObject } from './run'
import type { RemoveStore } from './supabase-store'

// Orphans: objects in the bucket that nothing points at. The rules (Ronen, 2026-11-09):
//  - no invoice row's file_url resolves to the object, AND the object's name appears in no text column of any table
//    in the app's schema (a reference can hide in a column nobody thinks of);
//  - created in the last 24 hours → kept (an upload that has not yet been saved to its row looks exactly like an orphan);
//  - every orphan is copied to a verified backup BEFORE the first delete, and any doubt before that stops the run.
// Everything here takes its I/O through interfaces, so the tests run the whole sweep against an in-memory bucket.

export const MIN_AGE_MS = 24 * 60 * 60 * 1000
export const DELETE_BATCH = 50

export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

export interface OrphanPlan {
  /** Objects no invoice row points at (before the DB-mention and age filters). */
  candidates: number
  /** Safe to delete. */
  orphans: StoredObject[]
  /** No row points at them, but a table mentions the name: KEPT. */
  mentioned: StoredObject[]
  /** Younger than the minimum age, or of unknown age: KEPT. */
  tooRecent: StoredObject[]
}

export function planOrphans(listing: readonly StoredObject[], referenced: ReadonlySet<string>, mentionedNames: ReadonlySet<string>, now: Date, minAgeMs = MIN_AGE_MS): OrphanPlan {
  const plan: OrphanPlan = { candidates: 0, orphans: [], mentioned: [], tooRecent: [] }
  for (const o of listing) {
    if (referenced.has(o.path)) continue
    plan.candidates++
    if (mentionedNames.has(baseName(o.path))) {
      plan.mentioned.push(o)
      continue
    }
    const created = o.createdAt ? Date.parse(o.createdAt) : NaN
    if (!Number.isFinite(created) || now.getTime() - created < minAgeMs) {
      plan.tooRecent.push(o) // unknown age counts as recent: a deletion must be provable
      continue
    }
    plan.orphans.push(o)
  }
  return plan
}

export const sumBytes = (xs: readonly StoredObject[]): number => xs.reduce((s, o) => s + o.size, 0)

/** The sweep expects a known number of orphans (the dry run found it). Far from that = something changed: stop and
 *  look, before a single delete. Returns the problem, or null when the numbers are within tolerance. */
export function checkExpectation(plan: OrphanPlan, expect: { count: number; bytes: number }, tol = { countPct: 5, bytesPct: 10 }): string | null {
  const off = (got: number, want: number, pct: number) => Math.abs(got - want) > (want * pct) / 100
  const bytes = sumBytes(plan.orphans)
  const problems: string[] = []
  if (off(plan.orphans.length, expect.count, tol.countPct)) problems.push(`${plan.orphans.length} orphans, expected about ${expect.count} (±${tol.countPct}%)`)
  if (off(bytes, expect.bytes, tol.bytesPct)) problems.push(`${(bytes / 1048576).toFixed(1)}MB, expected about ${(expect.bytes / 1048576).toFixed(1)}MB (±${tol.bytesPct}%)`)
  return problems.length ? problems.join('; ') : null
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export interface SweepDeps {
  reader: ReadStore
  remover: RemoveStore
  backup: BackupSession
  concurrency: number
  batchSize?: number
  onProgress?: (phase: 'backup' | 'delete', done: number, total: number) => void
}

export interface SweepResult {
  backedUp: number
  removed: number
  backupPath: string
}

/** Backup first, delete second. Nothing is deleted unless EVERY orphan was downloaded at its listed size, written to
 *  disk, and the archive was extracted and hashed back. A failure in the delete phase leaves the backup in place. */
export async function sweepOrphans(orphans: readonly StoredObject[], d: SweepDeps): Promise<SweepResult> {
  await d.backup.preflight(sumBytes(orphans))
  let done = 0
  let failure: unknown = null
  // The first failure stops the other workers from starting new items, and the function only returns once every
  // item already in flight has finished — so nothing is still writing into the backup directory after we give up.
  await mapPool(orphans, d.concurrency, async (o) => {
    if (failure) return
    try {
      const bytes = await d.reader.download(o.path)
      if (bytes.length !== o.size) throw new Error(`${o.path}: downloaded ${bytes.length} bytes, listed ${o.size} — nothing was deleted`)
      await d.backup.stage(o.path, bytes)
      d.onProgress?.('backup', ++done, orphans.length)
    } catch (err) {
      failure ??= err
    }
  })
  if (failure) throw failure
  const problem = await d.backup.archive()
  if (problem) throw new Error(`backup not proven (${problem}) — nothing was deleted`)

  let removed = 0
  for (const batch of chunk(orphans, d.batchSize ?? DELETE_BATCH)) {
    await d.remover.remove(batch.map((o) => o.path))
    removed += batch.length
    d.onProgress?.('delete', removed, orphans.length)
  }
  return { backedUp: d.backup.staged.length, removed, backupPath: d.backup.root }
}
