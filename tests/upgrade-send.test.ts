import { beforeEach, describe, expect, it, vi } from 'vitest'
import { upgradeAndSend } from '@/lib/upgrade-send'
import { fake, fakeClient, type Row } from './fake-postgrest'

// Owner's decision of 2026-11-11: after a receipt is upgraded to a tax invoice the accountant gets the TAX INVOICE, and
// "sent" is reported only when an e-mail really left. Never throws: the upgrade has already happened.

const RECEIPT: Row = {
  id: 'r1', vendor: 'Anthropic, PBC', doc_number: '1OGZD2JL-0009', doc_type: 'receipt', date: '04/06/2026', total: 100, currency: 'USD',
  file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/receipt.pdf', file_name: 'Receipt.pdf',
  sent_to_accountant_at: '2026-06-05T10:00:00Z', accountant_send_error: null, backed_up_to_drive_at: '2026-06-06T10:00:00Z', drive_file_id: 'd1',
  needs_review: 0, vendor_tax_id: null,
}
const NEW = { file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/invoice.pdf', file_name: 'Invoice.pdf', doc_type: 'invoice' }
const db = fakeClient as unknown as Parameters<typeof upgradeAndSend>[0]

beforeEach(() => {
  fake.reset({ invoices: [{ ...RECEIPT }] })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('upgradeAndSend', () => {
  it('sends the TAX INVOICE (the new file, not the receipt\'s) for the upgraded row, with the row\'s vendor and date', async () => {
    const send = vi.fn(async () => ({ sent: true }))
    const res = await upgradeAndSend(db, 'r1', NEW, send)
    expect(res).toMatchObject({ upgraded: true, sent: true, sendNote: null })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({
      invoiceId: 'r1', fileUrl: NEW.file_url, fileName: 'Invoice.pdf', vendor: 'Anthropic, PBC', date: '04/06/2026', needsReview: false,
    })
  })

  it('the send happens AFTER the swap: by then the row already points at the tax invoice and carries no "sent" marker', async () => {
    let seen: Row | undefined
    const send = vi.fn(async () => {
      seen = { ...fake.tables.get('invoices')![0]! }
      return { sent: true }
    })
    await upgradeAndSend(db, 'r1', NEW, send)
    expect(seen).toMatchObject({ file_url: NEW.file_url, doc_type: 'invoice', sent_to_accountant_at: null, backed_up_to_drive_at: null, drive_file_id: null })
  })

  it('"sent" is false — with the reason — whenever no e-mail left; the row stays "not sent" so the next scan\'s drain sends it', async () => {
    for (const result of [
      { sent: false, reason: 'no_accountant_email' },
      { sent: false, reason: 'gmail_not_connected' },
      { sent: false, reason: 'needs_review' },
      { sent: false, error: 'gmail_send_failed: 500' },
      { sent: false },
    ]) {
      fake.reset({ invoices: [{ ...RECEIPT }] })
      const res = await upgradeAndSend(db, 'r1', NEW, async () => result)
      expect(res, JSON.stringify(result)).toMatchObject({ upgraded: true, sent: false })
      expect((res as { sendNote: string | null }).sendNote).toBe(result.reason ?? result.error ?? 'not_sent')
      expect(fake.tables.get('invoices')![0]!.sent_to_accountant_at).toBeNull() // the swap cleared it; nothing set it again
    }
  })

  it('a sender that throws does not break the answer: upgraded, not sent, noted', async () => {
    const res = await upgradeAndSend(db, 'r1', NEW, async () => {
      throw new Error('boom')
    })
    expect(res).toMatchObject({ upgraded: true, sent: false, sendNote: 'send_error' })
  })

  it('a row that is under review is passed to the sender as such (the sender records "needs_review" and sends nothing)', async () => {
    fake.reset({ invoices: [{ ...RECEIPT, needs_review: 1 }] })
    const send = vi.fn(async () => ({ sent: false, reason: 'needs_review' }))
    const res = await upgradeAndSend(db, 'r1', NEW, send)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ needsReview: true }))
    expect(res).toMatchObject({ upgraded: true, sent: false, sendNote: 'needs_review' })
  })

  it('nothing is sent when nothing was upgraded — and the reason comes back unchanged', async () => {
    for (const [stored, incoming, reason] of [
      [{ ...RECEIPT, doc_type: 'invoice' }, NEW, 'not_a_receipt'],
      [{ ...RECEIPT }, { ...NEW, doc_type: 'receipt' }, 'not_a_tax_invoice'],
      [{ ...RECEIPT }, { ...NEW, file_url: null }, 'no_file'],
      [{ ...RECEIPT, vendor_tax_id: '512345678' }, { ...NEW, vendor_tax_id: '515456002' }, 'tax_id_mismatch'],
    ] as const) {
      fake.reset({ invoices: [{ ...stored }] })
      const send = vi.fn(async () => ({ sent: true }))
      expect(await upgradeAndSend(db, 'r1', incoming, send), reason).toEqual({ upgraded: false, reason })
      expect(send, reason).not.toHaveBeenCalled()
    }
  })

  it('a database error during the swap is reported as db_error and nothing is sent', async () => {
    fake.updateError = { message: 'boom', code: 'XX000' }
    const send = vi.fn(async () => ({ sent: true }))
    expect(await upgradeAndSend(db, 'r1', NEW, send)).toEqual({ upgraded: false, reason: 'db_error' })
    expect(send).not.toHaveBeenCalled()
  })
})
