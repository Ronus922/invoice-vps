import { beforeEach, describe, expect, it, vi } from 'vitest'
import { discardUnreferencedUpload, uploadedObjectPath } from '@/lib/discard-upload'
import { fake, fakeClient } from './fake-postgrest'

// A file that reached Storage and got no row is removed again — but ONLY a fresh upload that no row points at.

const UUID = 'ec4bfa54-f75c-4ab6-82c0-903883aeaf14'
const PATH = `invoices/${UUID}.pdf`
const URL_OF = (p: string) => `https://db.example/storage/v1/object/public/invoice-files/${p}`
const db = fakeClient as unknown as Parameters<typeof discardUnreferencedUpload>[0]

beforeEach(() => {
  fake.reset({ invoices: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('uploadedObjectPath — only the exact shape /api/upload stores', () => {
  it('accepts invoices/<uuid>.<ext> for every upload extension', () => {
    for (const ext of ['pdf', 'jpg', 'png', 'webp', 'gif', 'heic', 'heif']) {
      expect(uploadedObjectPath(URL_OF(`invoices/${UUID}.${ext}`))).toBe(`invoices/${UUID}.${ext}`)
    }
  })

  it('rejects everything else: other folders, other names, traversal, query strings, external URLs, non-strings', () => {
    for (const bad of [
      URL_OF('invoices/gmail_1785390400106_67016238-4620-4d84-b32d-caa951820a5e.jpg'),
      URL_OF(`other/${UUID}.pdf`),
      URL_OF(`invoices/sub/${UUID}.pdf`),
      URL_OF(`invoices/../${UUID}.pdf`),
      URL_OF(`invoices/${UUID}.pdf/../../x`),
      URL_OF(`invoices/${UUID}.pdf?x=1`),
      URL_OF(`invoices/${UUID}.exe`),
      URL_OF('invoices/not-a-uuid.pdf'),
      URL_OF('base44_8bf77d4e-106b-4e55-a5a0-67cb5b9d4e12.pdf'),
      'https://base44.app/files/x.pdf',
      '', null, undefined, 42, {},
    ]) expect(uploadedObjectPath(bad), String(bad)).toBeNull()
  })
})

describe('discardUnreferencedUpload', () => {
  it('an upload no row points at is removed — and only that object', async () => {
    expect(await discardUnreferencedUpload(db, URL_OF(PATH))).toBe('removed')
    expect(fake.removedObjects).toEqual([PATH])
  })

  it('an object some row points at is NEVER removed (a client naming an existing document\'s file gets "referenced")', async () => {
    fake.reset({ invoices: [{ id: 'r1', file_url: URL_OF(PATH) }] })
    expect(await discardUnreferencedUpload(db, URL_OF(PATH))).toBe('referenced')
    expect(fake.removedObjects).toEqual([])
  })

  it('a row pointing at a DIFFERENT object does not protect this one', async () => {
    fake.reset({ invoices: [{ id: 'r1', file_url: URL_OF('invoices/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf') }] })
    expect(await discardUnreferencedUpload(db, URL_OF(PATH))).toBe('removed')
    expect(fake.removedObjects).toEqual([PATH])
  })

  it('an object that is NOT fresh is never removed — e.g. the old file of an upgraded receipt, kept for delete-orphans (with a backup)', async () => {
    fake.objectAgeMs = 7 * 60 * 60 * 1000
    expect(await discardUnreferencedUpload(db, URL_OF(PATH))).toBe('too_old')
    fake.objectAgeMs = 30 * 24 * 60 * 60 * 1000
    expect(await discardUnreferencedUpload(db, URL_OF(PATH))).toBe('too_old')
    expect(fake.removedObjects).toEqual([])
    fake.objectAgeMs = 5 * 60 * 60 * 1000 // still within the window
    expect(await discardUnreferencedUpload(db, URL_OF(PATH))).toBe('removed')
  })

  it('an age that cannot be read keeps the object', async () => {
    fake.objectAgeMs = null
    expect(await discardUnreferencedUpload(db, URL_OF(PATH))).toBe('error')
    expect(fake.removedObjects).toEqual([])
  })

  it('an object that is already gone is "not_found" — asking again is harmless', async () => {
    fake.missingObjects = [`${UUID}.pdf`]
    expect(await discardUnreferencedUpload(db, URL_OF(PATH))).toBe('not_found')
    expect(fake.removedObjects).toEqual([])
  })

  it('a failed listing keeps the object', async () => {
    fake.listError = { message: 'storage down' }
    expect(await discardUnreferencedUpload(db, URL_OF(PATH))).toBe('error')
    expect(fake.removedObjects).toEqual([])
  })

  it('anything that is not a fresh upload is not touched, and nothing is even looked up', async () => {
    const before = fake.requests
    fake.missingObjects = []
    expect(await discardUnreferencedUpload(db, URL_OF('invoices/gmail_1_67016238-4620-4d84-b32d-caa951820a5e.jpg'))).toBe('not_an_upload')
    expect(await discardUnreferencedUpload(db, 'https://base44.app/x.pdf')).toBe('not_an_upload')
    expect(await discardUnreferencedUpload(db, null)).toBe('not_an_upload')
    expect(fake.requests).toBe(before)
    expect(fake.removedObjects).toEqual([])
  })

  it('a failed reference look-up keeps the object (it might be referenced) and says so', async () => {
    fake.failOnRequest = 1
    expect(await discardUnreferencedUpload(db, URL_OF(PATH))).toBe('error')
    expect(fake.removedObjects).toEqual([])
  })

  it('a failed removal is reported, never thrown', async () => {
    fake.storageError = { message: 'storage down' }
    expect(await discardUnreferencedUpload(db, URL_OF(PATH))).toBe('error')
  })

  it('never throws, whatever the client does', async () => {
    const broken = { from: () => { throw new Error('boom') }, storage: fakeClient.storage } as unknown as Parameters<typeof discardUnreferencedUpload>[0]
    expect(await discardUnreferencedUpload(broken, URL_OF(PATH))).toBe('error')
  })
})
