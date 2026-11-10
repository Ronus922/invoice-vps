// The app mails every invoice to the accountant FROM the connected Gmail account. Those mails carry the
// invoice PDF, so a scan that reads them re-creates every sent invoice as a new row (2026-07-30: 590 of the
// app's own mails were scanned and 282 rows were created from them). The scan skips them by three signs:
//   1. the Gmail search excludes the Sent label (-in:sent, in scan-gmail) — one layer, and only as good as the label;
//   2. every accountant mail carries a header of its own (OWN_SEND_HEADER) — checked per message, and honoured only
//      when the mail is also FROM the connected account (the header is a public constant: a stranger can write it);
//   3. mail sent FROM the connected account TO the accountant (and not to the owner himself) — which also covers the
//      mails sent before the header existed.
// Mail the owner sends to himself (a scan emailed from the scanner) is a real intake and is never skipped.
// Neither sign can be forged by a stranger without also forging the owner's From address.
// Pure: no I/O.

export const OWN_SEND_HEADER = 'X-InvoiceFlow-Origin'
export const OWN_SEND_HEADER_VALUE = 'accountant-send'

export interface MailHeader {
  name: string
  value: string
}

export type OwnSendReason = 'marker_header' | 'own_sender_to_accountant'

// Header values come from the sender: cap what is scanned and bound every quantifier, so a header that is one
// enormous token cannot stall the scan (an unbounded `[...]+@[...]+\.` is quadratic on such input).
const MAX_HEADER_CHARS = 2000
const ADDRESS = /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,24}/gi

/** Every e-mail address in a From/To/Cc header value, lower-cased. Only the address itself counts: a display name
 *  that looks like an address ("r@bios.co.il" <billing@x.co>) is dropped, the real address is the one in <...>. */
export function addressesIn(value: string): string[] {
  const text = value.slice(0, MAX_HEADER_CHARS)
  const out: string[] = []
  // "Name <addr>" groups: take the part inside <...> and ignore the name; then pick up bare addresses elsewhere.
  const bare = text.replace(/<([^<>]{1,320})>/g, (_m, inner: string) => {
    out.push(...(inner.match(ADDRESS) ?? []).map((a) => a.toLowerCase()))
    return ' '
  })
  // Whatever is left holds bare addresses ("a@b.co, c@d.co") and display names; quoted names are removed first.
  const rest = bare.replace(/"[^"]{0,200}"/g, ' ')
  out.push(...(rest.match(ADDRESS) ?? []).map((a) => a.toLowerCase()))
  return out
}

function headerValues(headers: readonly MailHeader[], name: string): string {
  return headers
    .filter((h) => h.name.toLowerCase() === name.toLowerCase())
    .map((h) => h.value)
    .join(', ')
}

/** Why this message is one of the app's own accountant mails, or null when it is not. */
export function ownSendReason(input: {
  headers: readonly MailHeader[]
  /** The connected Gmail account's address (users.getProfile); null when it could not be read. */
  ownAddress: string | null
  /** The accountant's address from the settings (may list several, separated by commas); null when none is set. */
  accountantEmail: string | null
}): OwnSendReason | null {
  const { headers } = input
  const own = input.ownAddress?.trim().toLowerCase() || ''
  const from = addressesIn(headerValues(headers, 'From'))

  if (headerValues(headers, OWN_SEND_HEADER).trim().toLowerCase() === OWN_SEND_HEADER_VALUE) {
    // The marker is only trusted on mail that comes from the owner's account. When that address is unknown the
    // marker stands alone (the search's -in:sent and this header are then the only signs).
    if (own === '' || from.includes(own)) return 'marker_header'
  }

  const accountant = input.accountantEmail ? addressesIn(input.accountantEmail) : []
  // An accountant address equal to the owner's own would make every self-mail look like an accountant mail.
  if (own === '' || accountant.length === 0 || accountant.includes(own)) return null
  const to = addressesIn(headerValues(headers, 'To'))
  return from.includes(own) && to.some((a) => accountant.includes(a)) && !to.includes(own) ? 'own_sender_to_accountant' : null
}
