import { beforeEach, describe, expect, it, vi } from 'vitest'
import { upgradeReceiptToTaxInvoice } from '@/lib/upgrade-receipt'
import { fake, fakeClient, type Row } from './fake-postgrest'

// The server half of Decision 1: the stored RECEIPT takes the tax invoice's file and doc_type — guarded, and without
// deleting the receipt's old file. Owner's decision of 2026-11-11: the swap also clears the "sent to the accountant" and
// "backed up to Drive" markers (the receipt's), so the TAX INVOICE is what gets sent and backed up; and a tax id known on
// both sides must be the same.

const RECEIPT: Row = {
  id: 'r1', vendor: 'Anthropic, PBC', doc_number: '1OGZD2JL-0009', doc_type: 'receipt', date: '04/06/2026', total: 100, currency: 'USD',
  file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/receipt.pdf', file_name: 'Receipt.pdf', sent_to_accountant_at: '2026-06-05T10:00:00Z',
  backed_up_to_drive_at: '2026-06-06T10:00:00Z', drive_file_id: 'drive-receipt-1', drive_backup_error: null, accountant_send_error: null,
  category: 'ענן', needs_review: 0, vendor_tax_id: null,
}
const NEW = { file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/invoice.pdf', file_name: 'Invoice.pdf', doc_type: 'invoice' }
const db = fakeClient as unknown as Parameters<typeof upgradeReceiptToTaxInvoice>[0]

beforeEach(() => fake.reset({ invoices: [{ ...RECEIPT }] }))

describe('upgradeReceiptToTaxInvoice', () => {
  it('swaps file_url, file_name and doc_type — and reports the replaced file, which it does not delete', async () => {
    expect(await upgradeReceiptToTaxInvoice(db, 'r1', NEW)).toMatchObject({ upgraded: true, replacedFileUrl: RECEIPT.file_url })
    const row = fake.tables.get('invoices')![0]!
    expect([row.file_url, row.file_name, row.doc_type]).toEqual([NEW.file_url, 'Invoice.pdf', 'invoice'])
  })

  it('keeps vendor, number, date, total, currency and category — the document itself is the same', async () => {
    await upgradeReceiptToTaxInvoice(db, 'r1', NEW)
    const row = fake.tables.get('invoices')![0]!
    for (const k of ['vendor', 'doc_number', 'date', 'total', 'currency', 'category'] as const) {
      expect(row[k], k).toBe(RECEIPT[k])
    }
  })

  it('clears the "sent to the accountant" markers: the row is NOT sent again until the tax invoice really is', async () => {
    await upgradeReceiptToTaxInvoice(db, 'r1', NEW)
    const row = fake.tables.get('invoices')![0]!
    expect(row.sent_to_accountant_at).toBeNull()
    expect(row.accountant_send_error).toBeNull()
  })

  it('clears ALL the Drive markers — including drive_file_id, which the backup job treats as "already uploaded" — so the tax invoice is backed up', async () => {
    await upgradeReceiptToTaxInvoice(db, 'r1', NEW)
    const row = fake.tables.get('invoices')![0]!
    expect(row.backed_up_to_drive_at).toBeNull()
    expect(row.drive_file_id).toBeNull()
    expect(row.drive_backup_error).toBeNull()
  })

  it('the update carries exactly: the new file and type, the cleared markers, updated_at — nothing else', async () => {
    await upgradeReceiptToTaxInvoice(db, 'r1', NEW)
    expect(Object.keys(fake.updates[0]!.values).sort()).toEqual([
      'accountant_send_error', 'backed_up_to_drive_at', 'doc_type', 'drive_backup_error', 'drive_file_id', 'file_name', 'file_url', 'sent_to_accountant_at', 'updated_at',
    ])
  })

  it('hands back what the follow-up e-mail needs: the row\'s vendor, date and review flag', async () => {
    const res = await upgradeReceiptToTaxInvoice(db, 'r1', NEW)
    expect(res).toMatchObject({ upgraded: true, row: { vendor: 'Anthropic, PBC', date: '04/06/2026', needs_review: false } })
    fake.reset({ invoices: [{ ...RECEIPT, needs_review: 1 }] })
    expect(await upgradeReceiptToTaxInvoice(db, 'r1', NEW)).toMatchObject({ upgraded: true, row: { needs_review: true } })
  })

  it('guards the swap on the row still being a receipt (atomic with the check)', async () => {
    await upgradeReceiptToTaxInvoice(db, 'r1', NEW)
    expect(fake.updates[0]!.filters).toEqual(['id=r1', 'doc_type=receipt'])
  })

  it('a row that stopped being a receipt in the meantime is left alone', async () => {
    fake.reset({ invoices: [{ ...RECEIPT, doc_type: 'invoice' }] })
    expect(await upgradeReceiptToTaxInvoice(db, 'r1', NEW)).toEqual({ upgraded: false, reason: 'not_a_receipt' })
    expect(fake.tables.get('invoices')![0]!.file_url).toBe(RECEIPT.file_url)
  })

  it('only a tax invoice or a tax invoice/receipt is an upgrade', async () => {
    for (const doc_type of ['receipt', 'unknown', 'credit_note', 'other', null, undefined]) {
      fake.reset({ invoices: [{ ...RECEIPT }] })
      expect(await upgradeReceiptToTaxInvoice(db, 'r1', { ...NEW, doc_type }), String(doc_type)).toEqual({ upgraded: false, reason: 'not_a_tax_invoice' })
      expect(fake.updates, String(doc_type)).toHaveLength(0)
    }
    fake.reset({ invoices: [{ ...RECEIPT }] })
    expect(await upgradeReceiptToTaxInvoice(db, 'r1', { ...NEW, doc_type: 'invoice_receipt' })).toMatchObject({ upgraded: true })
  })

  it('without an incoming file there is nothing to put in the row\'s place', async () => {
    expect(await upgradeReceiptToTaxInvoice(db, 'r1', { ...NEW, file_url: null })).toEqual({ upgraded: false, reason: 'no_file' })
    expect(fake.updates).toHaveLength(0)
    expect(fake.requests).toBe(0) // not even a read
  })

  it('the unique index says no: reported as a conflict, the row is unchanged', async () => {
    fake.updateError = { message: 'duplicate key', code: '23505' }
    expect(await upgradeReceiptToTaxInvoice(db, 'r1', NEW)).toEqual({ upgraded: false, reason: 'conflict' })
  })

  it('any other database error is a db_error, never a half upgrade', async () => {
    fake.updateError = { message: 'boom', code: 'XX000' }
    expect(await upgradeReceiptToTaxInvoice(db, 'r1', NEW)).toEqual({ upgraded: false, reason: 'db_error' })
    fake.reset({ invoices: [{ ...RECEIPT }] })
    fake.failOnRequest = 1 // the read of the old file_url
    expect(await upgradeReceiptToTaxInvoice(db, 'r1', NEW)).toEqual({ upgraded: false, reason: 'db_error' })
    expect(fake.updates).toHaveLength(0)
  })

  it('never deletes the replaced receipt file: a storage handle that is offered is never used (the file becomes an orphan, logged)', async () => {
    const removed: string[][] = []
    const withStorage = { from: fakeClient.from, storage: { from: () => ({ remove: async (p: string[]) => { removed.push(p); return { error: null } } }) } } as unknown as Parameters<typeof upgradeReceiptToTaxInvoice>[0]
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await upgradeReceiptToTaxInvoice(withStorage, 'r1', NEW)).toMatchObject({ upgraded: true })
    expect(removed).toEqual([])
    // the audit trail: the row and the file it no longer points at
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('old file is now unreferenced'), { id: 'r1', replacedFileUrl: RECEIPT.file_url })
    warn.mockRestore()
  })

  it('the same file arriving again (only the type changes) reports no replaced file', async () => {
    expect(await upgradeReceiptToTaxInvoice(db, 'r1', { ...NEW, file_url: RECEIPT.file_url as string })).toMatchObject({ upgraded: true, replacedFileUrl: null })
  })

  describe('the tax id: known on both sides ⇒ the same issuer, or no upgrade', () => {
    const withTaxId = (stored: string | null) => fake.reset({ invoices: [{ ...RECEIPT, vendor_tax_id: stored }] })

    it('both sides carry a tax id and they differ: NOT upgraded, nothing is written, and the refusal is logged (row id only)', async () => {
      withTaxId('512345678')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await upgradeReceiptToTaxInvoice(db, 'r1', { ...NEW, vendor_tax_id: '515456002' })).toEqual({ upgraded: false, reason: 'tax_id_mismatch' })
      expect(fake.updates).toHaveLength(0)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('NOT upgraded'), { id: 'r1' })
      expect(JSON.stringify(warn.mock.calls)).not.toContain('512345678')
      expect(JSON.stringify(warn.mock.calls)).not.toContain('515456002')
      warn.mockRestore()
    })

    it('the same tax id — written with hyphens or spaces — is the same issuer: upgraded', async () => {
      withTaxId('512345678')
      expect(await upgradeReceiptToTaxInvoice(db, 'r1', { ...NEW, vendor_tax_id: '51-2345678' })).toMatchObject({ upgraded: true })
      withTaxId('512345678')
      expect(await upgradeReceiptToTaxInvoice(db, 'r1', { ...NEW, vendor_tax_id: '512 345 678' })).toMatchObject({ upgraded: true })
    })

    it('a tax id on one side only never blocks the upgrade', async () => {
      withTaxId(null)
      expect(await upgradeReceiptToTaxInvoice(db, 'r1', { ...NEW, vendor_tax_id: '512345678' })).toMatchObject({ upgraded: true })
      withTaxId('512345678')
      expect(await upgradeReceiptToTaxInvoice(db, 'r1', { ...NEW, vendor_tax_id: null })).toMatchObject({ upgraded: true })
      withTaxId('512345678')
      expect(await upgradeReceiptToTaxInvoice(db, 'r1', NEW)).toMatchObject({ upgraded: true }) // not given at all
    })

    it('a garbled tax id (not 8–9 digits) counts as "not known" — it cannot make the same document look like another issuer', async () => {
      withTaxId('512345678')
      expect(await upgradeReceiptToTaxInvoice(db, 'r1', { ...NEW, vendor_tax_id: '12-34' })).toMatchObject({ upgraded: true })
    })

    it('the check happens before any write', async () => {
      withTaxId('512345678')
      await upgradeReceiptToTaxInvoice(db, 'r1', { ...NEW, vendor_tax_id: '515456002' })
      expect(fake.updates).toHaveLength(0)
    })
  })
})
