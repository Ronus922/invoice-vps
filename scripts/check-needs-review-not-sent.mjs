#!/usr/bin/env node
// INVARIANT: the accountant never receives an unverified invoice.
//   sendInvoiceToAccountant() refuses needs_review, and the send route
//   re-checks it — so no invoice can be sent WHILE it needs review.
//   The DB proxy: no row is (needs_review=true AND sent_to_accountant_at set).
//
// KNOWN LEGACY BACKLOG: three invoices were sent to the accountant BEFORE
//   arithmetic validation existed, then corrected + flagged on 2026-07-18
//   (see scripts/apply-reextract.mjs). They now need a CORRECTED copy re-sent
//   to the accountant, after which needs_review is cleared and they drop off
//   this list automatically. They are listed explicitly (not hidden): the
//   check still FAILS on any *other* needs_review+sent invoice — i.e. it fully
//   catches new regressions. Remove each id here once its corrected copy is
//   re-sent.
import { run, psql, fail, ok, info } from './_lib.mjs'

const KNOWN_BACKLOG = new Set([
  'a0bb4e86-7c0f-4f8b-84d3-1e9a1eb0bc2b', // יחיאל שדר 855931801  — total 250, pretax+vat=253.90
  '4d6f8ce0-a5cd-46d9-ab78-a3c44a5796e1', // יחיאל שדר 1040193419 — total 150, pretax+vat=148.60
  'ca2ef55c-da21-4a1b-a381-03d18780f176', // פזגז 44100314533     — credit note, total −104.1
])

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
