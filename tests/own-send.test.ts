import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { OWN_SEND_HEADER, OWN_SEND_HEADER_VALUE, addressesIn, ownSendReason, type MailHeader } from '@/lib/own-send'

// accountant-send.ts opens a Supabase client when it is imported; this file only builds a MIME string.
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
import { buildMimeMessage } from '@/lib/accountant-send'

// The app mails every invoice to the accountant from the connected Gmail account. A scan that reads those mails
// back re-creates each sent invoice (2026-07-30: 590 of them scanned, 282 rows created). Signs: the marker header
// (only on mail from the owner's account), or mail from the owner's account to the accountant.

const OWN = 'owner@example.test'
const ACCOUNTANT = 'books@accountant.example'
const h = (name: string, value: string): MailHeader => ({ name, value })

describe('ownSendReason', () => {
  it('BEFORE the fix: the mail the app sent on 2026-07-30 looks like this — From the account, To the accountant, subject "חשבונית - ספק - תאריך"', () => {
    const headers = [h('From', 'The Owner <owner@example.test>'), h('To', ACCOUNTANT), h('Subject', 'חשבונית - OVHcloud - 01/07/2026')]
    expect(ownSendReason({ headers, ownAddress: OWN, accountantEmail: ACCOUNTANT })).toBe('own_sender_to_accountant')
  })

  it('the marker header on mail from the owner’s account is enough, even when the accountant is unknown', () => {
    const headers = [h('From', OWN), h('To', 'z@y.co'), h(OWN_SEND_HEADER, OWN_SEND_HEADER_VALUE)]
    expect(ownSendReason({ headers, ownAddress: OWN, accountantEmail: null })).toBe('marker_header')
  })

  it('a stranger who copies the (public) marker header is NOT skipped — the mail must also come from the owner’s account', () => {
    const headers = [h('From', 'billing@vendor.example'), h('To', OWN), h(OWN_SEND_HEADER, OWN_SEND_HEADER_VALUE)]
    expect(ownSendReason({ headers, ownAddress: OWN, accountantEmail: ACCOUNTANT })).toBeNull()
  })

  it('when the owner’s address could not be read the marker stands alone', () => {
    expect(ownSendReason({ headers: [h('From', 'x@y.co'), h(OWN_SEND_HEADER, OWN_SEND_HEADER_VALUE)], ownAddress: null, accountantEmail: null })).toBe('marker_header')
  })

  it('the header name is case-insensitive; another value is not the marker', () => {
    expect(ownSendReason({ headers: [h('From', OWN), h(OWN_SEND_HEADER.toLowerCase(), OWN_SEND_HEADER_VALUE)], ownAddress: OWN, accountantEmail: null })).toBe('marker_header')
    expect(ownSendReason({ headers: [h('From', OWN), h(OWN_SEND_HEADER, 'something-else')], ownAddress: OWN, accountantEmail: null })).toBeNull()
  })

  it('mail the owner sends to HIMSELF (a scan emailed from the scanner) is not skipped — it is a real intake', () => {
    const headers = [h('From', OWN), h('To', OWN), h('Subject', 'חשבונית - ספק - 28/07/2026')]
    expect(ownSendReason({ headers, ownAddress: OWN, accountantEmail: ACCOUNTANT })).toBeNull()
  })

  it('…even when the accountant is copied: To includes the owner, so it is not an accountant send', () => {
    const headers = [h('From', OWN), h('To', OWN), h('Cc', ACCOUNTANT)]
    expect(ownSendReason({ headers, ownAddress: OWN, accountantEmail: ACCOUNTANT })).toBeNull()
  })

  it('…and when the owner and the accountant are both in To: still a mail to the owner, not an accountant send', () => {
    const headers = [h('From', OWN), h('To', `${OWN}, ${ACCOUNTANT}`)]
    expect(ownSendReason({ headers, ownAddress: OWN, accountantEmail: ACCOUNTANT })).toBeNull()
  })

  it('mail from the accountant or a vendor to the owner is not skipped — and a vendor invoice that merely copies the accountant is a real intake', () => {
    expect(ownSendReason({ headers: [h('From', ACCOUNTANT), h('To', OWN)], ownAddress: OWN, accountantEmail: ACCOUNTANT })).toBeNull()
    expect(ownSendReason({ headers: [h('From', 'billing@vendor.example'), h('To', OWN), h('Cc', ACCOUNTANT)], ownAddress: OWN, accountantEmail: ACCOUNTANT })).toBeNull()
  })

  it('a display name that looks like an address cannot fake either side', () => {
    const forged = [h('From', `"${OWN}" <billing@evil.example>`), h('To', `"${ACCOUNTANT}" <someone@else.example>`)]
    expect(ownSendReason({ headers: forged, ownAddress: OWN, accountantEmail: ACCOUNTANT })).toBeNull()
  })

  it('finds the accountant in To among several recipients, upper case, in a "Name <addr>" list', () => {
    const headers = [h('From', '"Owner, The" <Owner@Example.Test>'), h('To', `a@b.co, Books <${ACCOUNTANT.toUpperCase()}>`)]
    expect(ownSendReason({ headers, ownAddress: OWN, accountantEmail: ACCOUNTANT })).toBe('own_sender_to_accountant')
  })

  it('an accountant setting that lists several addresses matches any of them', () => {
    const headers = [h('From', OWN), h('To', 'second@accountant.example')]
    expect(ownSendReason({ headers, ownAddress: OWN, accountantEmail: `${ACCOUNTANT}, second@accountant.example` })).toBe('own_sender_to_accountant')
  })

  it('without the accountant or the own address the address rule does not guess', () => {
    const headers = [h('From', OWN), h('To', ACCOUNTANT)]
    expect(ownSendReason({ headers, ownAddress: null, accountantEmail: ACCOUNTANT })).toBeNull()
    expect(ownSendReason({ headers, ownAddress: OWN, accountantEmail: null })).toBeNull()
  })

  it('when the accountant address IS the owner’s own, the address rule is off (every self-mail would match); the marker still works', () => {
    const headers = [h('From', OWN), h('To', OWN)]
    expect(ownSendReason({ headers, ownAddress: OWN, accountantEmail: OWN })).toBeNull()
    expect(ownSendReason({ headers: [...headers, h(OWN_SEND_HEADER, OWN_SEND_HEADER_VALUE)], ownAddress: OWN, accountantEmail: OWN })).toBe('marker_header')
  })
})

describe('addressesIn', () => {
  it('extracts and lower-cases every real address, ignoring display names', () => {
    expect(addressesIn('Ronen <R@bios.co.il>, "x, y" <a.b+c@d-e.org>')).toEqual(['r@bios.co.il', 'a.b+c@d-e.org'])
    expect(addressesIn('plain@one.co, other@two.co')).toEqual(['plain@one.co', 'other@two.co'])
    expect(addressesIn('')).toEqual([])
  })

  it('looks only at the first 2000 characters of a header value, and at address parts of a sane length', () => {
    expect(addressesIn('a@b.co' + ' '.repeat(5000) + 'late@x.co')).toEqual(['a@b.co'])
    const [long] = addressesIn('a'.repeat(100) + '@b.co')
    expect(long!.length).toBeLessThanOrEqual(64 + '@b.co'.length)
  })

  it('survives a hostile header: one enormous token does not stall the scan (the regex is bounded and the value capped)', () => {
    const started = Date.now()
    for (const evil of ['a'.repeat(200_000), 'a'.repeat(100_000) + '@' + 'b'.repeat(100_000), 'x@' + 'y'.repeat(100_000), '<'.repeat(50_000), '"'.repeat(50_000)]) addressesIn(evil)
    expect(Date.now() - started).toBeLessThan(1000)
  })
})

describe('the accountant mail carries the marker', () => {
  it('buildMimeMessage adds the header, before the body', () => {
    const raw = buildMimeMessage({
      to: ACCOUNTANT, subject: 'חשבונית - X - 01/01/2026', bodyText: 'מצורפת חשבונית', attachmentData: Buffer.from('pdf'),
      attachmentFilename: 'a.pdf', attachmentMimeType: 'application/pdf',
    })
    const head = raw.split('\r\n\r\n')[0]!
    expect(head).toContain(`${OWN_SEND_HEADER}: ${OWN_SEND_HEADER_VALUE}`)
    // and a mail built this way, as it sits in the Sent copy (Gmail adds From), is recognised by the scan's check
    const headers = [...head.split('\r\n').map((l) => { const i = l.indexOf(':'); return h(l.slice(0, i), l.slice(i + 1).trim()) }), h('From', OWN)]
    expect(ownSendReason({ headers, ownAddress: OWN, accountantEmail: ACCOUNTANT })).toBe('marker_header')
  })

  it('the Gmail scan checks every message with ownSendReason and keeps -in:sent in its search', () => {
    const route = readFileSync(new URL('../src/app/api/scan-gmail/route.ts', import.meta.url), 'utf8')
    expect(route).toMatch(/ownSendReason\(\{ headers, ownAddress, accountantEmail \}\)/)
    expect(route).toContain('-in:spam -in:trash -in:sent')
    // the skip happens before any attachment of that message is looked at
    expect(route.indexOf('ownSendReason(')).toBeLessThan(route.indexOf('collectAttachmentParts(msg.payload'))
  })
})
