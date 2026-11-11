// The server half of Decision 1 (src/lib/doc-upgrade.ts): a tax invoice arrives for a document the table holds as a
// RECEIPT. The row stays — it is the one row of that transaction — and takes the tax invoice's FILE and doc_type.
// Vendor, number, date, amounts and category stay as they are.
//
// Owner's decision of 2026-11-11 (it replaces "the flags stay"): the accountant must get the TAX INVOICE and Drive must
// hold it, so the swap also CLEARS the markers that said "the receipt was sent / backed up":
//   - sent_to_accountant_at / accountant_send_error → null: the row is "not sent" again until the tax invoice is
//     really sent (src/lib/upgrade-send.ts sends it right away; drainUnsentToAccountant is the safety net if that
//     fails — nothing shows "sent" unless an e-mail really left);
//   - backed_up_to_drive_at / drive_file_id / drive_backup_error → null: the Drive job skips a row that still points at
//     a Drive file ("never upload a second copy"), so clearing only the timestamp would just re-mark the OLD receipt.
// The old Drive copy of the receipt is not touched.
//
// A tax id known on BOTH sides must be the same: otherwise the two documents are not the same document and nothing is
// upgraded (the identity lookup already requires it; this is the second lock on the same door, and it logs).
//
// The receipt's old file is NOT deleted: it is returned as `replacedFileUrl` and logged, and becomes an orphan of the
// bucket. Deleting a customer's only copy of a document from a code path that runs unattended is not worth the saved
// bytes — scripts/delete-orphans.ts removes orphans later, with a backup.
//
// Called by every server road that can meet the situation (through upgradeAndSend, src/lib/upgrade-send.ts): the Gmail
// scan, POST /api/invoices (manual upload and folder scan) and the phone scan. The caller has already stored the
// incoming file; on `upgraded: false` it handles the incoming file exactly as it handles a plain duplicate.
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeDocType } from './doc-type'
import { normalizeTaxId } from './doc-identity'

export interface UpgradeIncoming {
  file_url: string | null
  file_name: string | null
  doc_type: unknown
  /** The issuer's tax id as the extraction read it; compared with the row's only when both have one. */
  vendor_tax_id?: string | null
}

/** What the follow-up (the e-mail to the accountant) needs to know about the row that was upgraded. */
export interface UpgradedRow {
  vendor: string | null
  date: string | null
  needs_review: boolean
}

export type UpgradeResult =
  | { upgraded: true; replacedFileUrl: string | null; row: UpgradedRow }
  | { upgraded: false; reason: 'no_file' | 'not_a_tax_invoice' | 'not_a_receipt' | 'tax_id_mismatch' | 'conflict' | 'db_error' }

export async function upgradeReceiptToTaxInvoice(
  db: Pick<SupabaseClient, 'from'>,
  existingId: string,
  incoming: UpgradeIncoming,
): Promise<UpgradeResult> {
  // Without a file there is nothing to put in the row's place.
  if (!incoming.file_url) return { upgraded: false, reason: 'no_file' }
  const docType = normalizeDocType(incoming.doc_type)
  if (docType !== 'invoice' && docType !== 'invoice_receipt') return { upgraded: false, reason: 'not_a_tax_invoice' }

  const { data: before, error: readError } = await db
    .from('invoices')
    .select('file_url, vendor, date, needs_review, vendor_tax_id')
    .eq('id', existingId)
    .single()
  if (readError) return { upgraded: false, reason: 'db_error' }
  const stored = before as { file_url: string | null; vendor: string | null; date: string | null; needs_review: boolean | null; vendor_tax_id: string | null } | null
  const replacedFileUrl = stored?.file_url ?? null

  const incomingTaxId = normalizeTaxId(incoming.vendor_tax_id)
  const storedTaxId = normalizeTaxId(stored?.vendor_tax_id)
  if (incomingTaxId && storedTaxId && incomingTaxId !== storedTaxId) {
    // Row id only: the tax ids themselves stay out of the log.
    console.warn('[upgrade-receipt] NOT upgraded: both sides carry a tax id and they differ — a different issuer, not the same document:', { id: existingId })
    return { upgraded: false, reason: 'tax_id_mismatch' }
  }

  // The doc_type guard makes the swap atomic with the check: a row that stopped being a receipt in the meantime
  // (edited, or upgraded by a parallel scan) is left alone and reported as not upgraded.
  const { data: updated, error } = await db
    .from('invoices')
    .update({
      file_url: incoming.file_url,
      file_name: incoming.file_name,
      doc_type: docType,
      sent_to_accountant_at: null,
      accountant_send_error: null,
      backed_up_to_drive_at: null,
      drive_file_id: null,
      drive_backup_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existingId)
    .eq('doc_type', 'receipt')
    .select('id')
  if (error) {
    // The (vendor, doc_number, doc_type) unique index: another row already holds that identity as a tax invoice.
    return { upgraded: false, reason: error.code === '23505' ? 'conflict' : 'db_error' }
  }
  if (!updated || updated.length !== 1) return { upgraded: false, reason: 'not_a_receipt' }

  if (replacedFileUrl && replacedFileUrl !== incoming.file_url) {
    // The audit trail: which row, and which file it no longer points at (the bucket is private; the URL opens nothing by itself).
    console.warn('[upgrade-receipt] receipt upgraded to a tax invoice; its old file is now unreferenced:', { id: existingId, replacedFileUrl })
  }
  return {
    upgraded: true,
    replacedFileUrl: replacedFileUrl !== incoming.file_url ? replacedFileUrl : null,
    row: { vendor: stored?.vendor ?? null, date: stored?.date ?? null, needs_review: Boolean(stored?.needs_review) },
  }
}
