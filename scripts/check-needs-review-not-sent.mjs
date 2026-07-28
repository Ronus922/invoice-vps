#!/usr/bin/env node
// INVARIANT: the accountant never receives an unverified invoice.
//   sendInvoiceToAccountant() refuses needs_review, and the send route
//   re-checks it — so no invoice can be sent WHILE it needs review.
//   The DB proxy: no row is (needs_review=true AND sent_to_accountant_at set).
//
// KNOWN LEGACY BACKLOG: invoices sent to the accountant BEFORE arithmetic
//   validation existed, listed explicitly (not hidden) so the check still
//   FAILS on any *other* needs_review+sent invoice. Remove each id once
//   resolved. The original three (2026-07-18) were deleted from the DB and
//   removed here on 2026-07-28 — the set is currently empty.
import { run, psql, fail, ok, info } from './_lib.mjs'

const KNOWN_BACKLOG = new Set([])

run('check-needs-review-not-sent', async () => {
  const rows = psql(`
    select id||'\t'||vendor||'\t'||coalesce(doc_number,'?')
    from public.invoices
    where needs_review = true and sent_to_accountant_at is not null`)
    .split('\n').filter(Boolean).map((l) => l.split('\t'))

  const unexpected = rows.filter(([id]) => !KNOWN_BACKLOG.has(id))
  const backlog = rows.filter(([id]) => KNOWN_BACKLOG.has(id))

  if (unexpected.length === 0) {
    ok('אין חשבונית needs_review שנשלחה לרו״ח מעבר ל-backlog הידוע')
  } else {
    fail(`${unexpected.length} חשבוניות needs_review נשלחו לרו״ח (רגרסיה חדשה!)`)
    for (const [, vendor, doc] of unexpected) console.error(`    • ${vendor}/${doc}`)
  }

  if (backlog.length) {
    info(`backlog ידוע (${backlog.length}): נשלחו לפני האימות, ממתינות לשליחת עותק מתוקן:`)
    for (const [, vendor, doc] of backlog) info(`    · ${vendor}/${doc}`)
  }
  // A backlog id that no longer needs review means it was resolved — nudge cleanup.
  const stale = [...KNOWN_BACKLOG].filter((id) => !rows.some(([rid]) => rid === id))
  if (stale.length) info(`ניתן להסיר מ-KNOWN_BACKLOG (כבר לא needs_review+sent): ${stale.join(', ')}`)
})
