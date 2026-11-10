import { describe, expect, it } from 'vitest'
import { withKeyLock } from '@/lib/key-lock'

// The Gmail scan handles five attachments at once; two copies of one document in the same batch must not both pass
// "is it stored?" before either has stored itself. withKeyLock runs jobs of one key one after another.

const tick = () => new Promise<void>((r) => setTimeout(r, 5))

describe('withKeyLock', () => {
  it('runs two jobs with the same key one after the other — the second starts only when the first has finished', async () => {
    const log: string[] = []
    const job = (name: string) => async () => {
      log.push(`${name}:start`)
      await tick()
      log.push(`${name}:end`)
      return name
    }
    const results = await Promise.all([withKeyLock('k', job('a')), withKeyLock('k', job('b')), withKeyLock('k', job('c'))])
    expect(results).toEqual(['a', 'b', 'c'])
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end'])
  })

  it('"check then insert" under the lock: of two concurrent copies only the first inserts', async () => {
    const stored = new Set<string>()
    const attempt = () =>
      withKeyLock('doc-1', async () => {
        if (stored.has('doc-1')) return 'duplicate'
        await tick() // the insert takes a moment — without the lock the second copy passes the check meanwhile
        stored.add('doc-1')
        return 'created'
      })
    expect((await Promise.all([attempt(), attempt(), attempt()])).sort()).toEqual(['created', 'duplicate', 'duplicate'])
    // …and without the lock all three would have been created:
    const unlocked = new Set<string>()
    const bare = async () => {
      if (unlocked.has('doc-1')) return 'duplicate'
      await tick()
      unlocked.add('doc-1')
      return 'created'
    }
    expect(await Promise.all([bare(), bare(), bare()])).toEqual(['created', 'created', 'created'])
  })

  it('different keys, and no key, run side by side', async () => {
    const log: string[] = []
    const job = (name: string) => async () => {
      log.push(`${name}:start`)
      await tick()
      log.push(`${name}:end`)
    }
    await Promise.all([withKeyLock('a', job('a')), withKeyLock('b', job('b')), withKeyLock(null, job('n1')), withKeyLock(null, job('n2'))])
    expect(log.slice(0, 4).sort()).toEqual(['a:start', 'b:start', 'n1:start', 'n2:start'])
  })

  it('a failing job does not block the next one, and its error reaches its own caller only', async () => {
    const failing = withKeyLock('k', async () => {
      await tick()
      throw new Error('insert failed')
    })
    const next = withKeyLock('k', async () => 'ok')
    await expect(failing).rejects.toThrow('insert failed')
    await expect(next).resolves.toBe('ok')
  })

  it('leaves nothing behind: a later job with the same key runs at once', async () => {
    await withKeyLock('k', async () => 1)
    const started = Date.now()
    await withKeyLock('k', async () => 2)
    expect(Date.now() - started).toBeLessThan(50)
  })
})
