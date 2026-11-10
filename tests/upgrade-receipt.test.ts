import { beforeEach, describe, expect, it } from 'vitest'
import { upgradeReceiptToTaxInvoice } from '@/lib/upgrade-receipt'
import { fake, fakeClient, type Row } from './fake-postgrest'

// The server half of Decision 1: the stored RECEIPT takes the tax invoice's file and doc_type — guarded, minimal, and
// without deleting the receipt's old file.

const RECEIPT: Row = {
  id: 'r1', vendor: 'Anthropic, PBC', doc_number: '1OGZD2JL-0009', doc_type: 'receipt', date: '04/06/2026', total: 100, currency: 'USD',
  file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/receipt.pdf', file_name: 'Receipt.pdf', sent_to_accountant_at: '2026-06-05T10:00:00Z',
  backed_up_to_drive_at: '2026-06-06T10:00:00Z', category: 'ענן',
}
const NEW = { file_url: 'https://x/storage/v1/object/public/invoice-files/invoices/invoice.pdf', file_name: 'Invoice.pdf', doc_type: 'invoice' }
const db = fakeClient as unknown as Parameters<typeof upgradeReceiptToTaxInvoice>[0]

beforeEach(() => fake.reset({ invoices: [{ ...RECEIPT }] }))

describe('upgradeReceiptToTaxInvoice', () => {
  it('swaps file_url, file_name and doc_type — and reports the replaced file, which it does not delete', async () => {
    expect(await upgradeReceiptToTaxInvoice(db, 'r1', NEW)).toEqual({ upgraded: true, replacedFileUrl: RECEIPT.file_url })
    const row = fake.tables.get('invoices')![0]!
    expect([row.file_url, row.file_name, row.doc_type]).toEqual([NEW.file_url, 'Invoice.pdf', 'invoice'])
  })

  it('touches nothing else: vendor, number, date, total, category, the sent and Drive-backup flags keep their values', async () => {
    await upgradeReceiptToTaxInvoice(db, 'r1', NEW)
    const row = fake.tables.get('invoices')![0]!
    for (const k of ['vendor', 'doc_number', 'date', 'total', 'currency', 'category', 'sent_to_accountant_at', 'backed_up_to_drive_at'] as const) {
      expect(row[k], k).toBe(RECEIPT[k])
    }
    expect(Object.keys(fake.updates[0]!.values).sort()).toEqual(['doc_type', 'file_name', 'file_url', 'updated_at'])
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

  it('the same file arriving again (only the type changes) reports no replaced file', async () => {
    expect(await upgradeReceiptToTaxInvoice(db, 'r1', { ...NEW, file_url: RECEIPT.file_url as string })).toEqual({ upgraded: true, replacedFileUrl: null })
  })
})
