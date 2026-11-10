// The server half of Decision 1 (src/lib/doc-upgrade.ts): a tax invoice arrives for a document the table holds as a
// RECEIPT. The row stays — it is the one row of that transaction — and takes the tax invoice's FILE and doc_type.
// Nothing else on the row changes: vendor, number, date, amounts, category and the sent-to-accountant / Drive-backup
// flags stay as they are (the accountant already has the receipt; whether to send the tax invoice too is Ronen's call).
//
// The receipt's old file is NOT deleted: it is returned as `replacedFileUrl` and logged, and becomes an orphan of the
// bucket. Deleting a customer's only copy of a document from a code path that runs unattended is not worth the saved
// bytes — scripts/delete-orphans.ts removes orphans later, with a backup.
//
// Called by every server road that can meet the situation: the Gmail scan, POST /api/invoices (manual upload and
// folder scan) and the phone scan. The caller has already stored the incoming file; on `upgraded: false` it handles the
// incoming file exactly as it handles a plain duplicate.
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeDocType } from './doc-type'

export interface UpgradeIncoming {
  file_url: string | null
  file_name: string | null
  doc_type: unknown
}

export type UpgradeResult =
  | { upgraded: true; replacedFileUrl: string | null }
  | { upgraded: false; reason: 'no_file' | 'not_a_tax_invoice' | 'not_a_receipt' | 'conflict' | 'db_error' }

export async function upgradeReceiptToTaxInvoice(
  db: Pick<SupabaseClient, 'from'>,
  existingId: string,
  incoming: UpgradeIncoming,
): Promise<UpgradeResult> {
  // Without a file there is nothing to put in the row's place.
  if (!incoming.file_url) return { upgraded: false, reason: 'no_file' }
  const docType = normalizeDocType(incoming.doc_type)
  if (docType !== 'invoice' && docType !== 'invoice_receipt') return { upgraded: false, reason: 'not_a_tax_invoice' }

  const { data: before, error: readError } = await db.from('invoices').select('file_url').eq('id', existingId).single()
  if (readError) return { upgraded: false, reason: 'db_error' }
  const replacedFileUrl = (before as { file_url: string | null } | null)?.file_url ?? null

  // The doc_type guard makes the swap atomic with the check: a row that stopped being a receipt in the meantime
  // (edited, or upgraded by a parallel scan) is left alone and reported as not upgraded.
  const { data: updated, error } = await db
    .from('invoices')
    .update({ file_url: incoming.file_url, file_name: incoming.file_name, doc_type: docType, updated_at: new Date().toISOString() })
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
  return { upgraded: true, replacedFileUrl: replacedFileUrl !== incoming.file_url ? replacedFileUrl : null }
}
