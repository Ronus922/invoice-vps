// "Upgrade the receipt, then send the tax invoice" — the one step every server road takes (Gmail scan, POST /api/invoices,
// the phone scan). Owner's decision of 2026-11-11: after a receipt is upgraded to a tax invoice, the accountant gets the
// TAX INVOICE (sendInvoiceToAccountant) and Drive backs it up (the swap clears the Drive markers, src/lib/upgrade-receipt.ts).
//
// `sent` is true ONLY when an e-mail really left: every screen that says "sent" reads it from here. When the send does
// not happen (no accountant e-mail, Gmail not connected, a failed request, a row under review) the row is left "not sent"
// — sendInvoiceToAccountant records the reason — and drainUnsentToAccountant sends it with the next scan.
//
// This module never throws: the upgrade has already happened, and the caller must still answer.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SendInput, SendResult } from './accountant-send'
import { upgradeReceiptToTaxInvoice, type UpgradeIncoming, type UpgradeResult } from './upgrade-receipt'

export type UpgradeAndSendResult =
  | (Extract<UpgradeResult, { upgraded: true }> & { sent: boolean; sendNote: string | null })
  | Extract<UpgradeResult, { upgraded: false }>

type Sender = (input: SendInput) => Promise<SendResult>

// Lazy on purpose: accountant-send creates its service client at import time, so merely importing this module (a unit
// test, a build step) must not need the service-role env.
const defaultSend: Sender = async (input) => (await import('./accountant-send')).sendInvoiceToAccountant(input)

export async function upgradeAndSend(
  db: Pick<SupabaseClient, 'from'>,
  existingId: string,
  incoming: UpgradeIncoming,
  send: Sender = defaultSend,
): Promise<UpgradeAndSendResult> {
  const upgrade = await upgradeReceiptToTaxInvoice(db, existingId, incoming)
  if (!upgrade.upgraded) return upgrade

  let sent = false
  let sendNote: string | null = null
  try {
    const result = await send({
      invoiceId: existingId,
      fileUrl: incoming.file_url as string, // upgraded ⇒ the upgrade saw a file
      fileName: incoming.file_name,
      vendor: upgrade.row.vendor,
      date: upgrade.row.date,
      needsReview: upgrade.row.needs_review,
    })
    sent = result.sent === true
    sendNote = sent ? null : (result.reason ?? result.error ?? 'not_sent')
  } catch (err) {
    console.error('[upgrade-send] the tax invoice could not be sent after the upgrade:', existingId, err instanceof Error ? err.message : err)
    sendNote = 'send_error'
  }
  if (!sent) console.warn('[upgrade-send] receipt upgraded but the tax invoice was NOT sent (%s) — the next scan sends it:', sendNote, existingId)
  return { ...upgrade, sent, sendNote }
}
