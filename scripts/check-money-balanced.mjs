#!/usr/bin/env node
// INVARIANT: no invoice is SILENTLY wrong. An invoice is "unsound" when
//   total is missing/≤0, or (both pretax & vat present) pretax+vat ≠ total
//   beyond tolerance max(0.05, total*0.005) — same rule as the app.
//   The app's contract is: unsound ⟹ needs_review=true (surfaced for a human,
//   and check-needs-review-not-sent keeps it out of the accountant export).
//   So the real failure is an unsound invoice that is NOT flagged — a wrong
//   number treated as final. That is what must be zero.
// Read-only against the real DB. Mirrors src/lib/invoice-validation.ts and
// (for derived rows) src/lib/vat-derivation.ts.
import { run, scalar, fail, ok, info } from './_lib.mjs'

const UNSOUND = `(
  total is null or total <= 0
  or (pretax is not null and vat is not null
      and abs((pretax + vat) - total) > greatest(0.05, total * 0.005))
)`

run('check-money-balanced', async () => {
  const silent = scalar(`
    select count(*) from public.invoices
    where needs_review = false and ${UNSOUND}`)
  if (silent === '0') ok('אין חשבונית לא-מאוזנת שאינה מסומנת needs_review (אין שגיאה שקטה)')
  else {
    fail(`${silent} חשבוניות לא-מאוזנות שאינן מסומנות needs_review (שגיאה כספית שקטה!)`)
    const sample = scalar(`
      select string_agg(vendor||'/'||coalesce(doc_number,'?')||': '||coalesce(pretax::text,'∅')||'+'||coalesce(vat::text,'∅')||'≠'||coalesce(total::text,'∅'), ' | ')
      from (
        select vendor, doc_number, pretax, vat, total from public.invoices
        where needs_review = false and ${UNSOUND} limit 5
      ) s`)
    if (sample) info('דוגמאות: ' + sample)
  }

  // Unsound but correctly flagged — working as designed, not a failure.
  const flagged = scalar(`
    select count(*) from public.invoices where needs_review = true and ${UNSOUND}`)
  if (flagged !== '0') info(`${flagged} חשבוניות לא-מאוזנות מסומנות needs_review (תקין — ממתינות לתיקון ידני)`)

  // Derived rows (vat_derived=true) are balanced BY CONSTRUCTION — pretax/vat
  // computed from total in src/lib/vat-derivation.ts. Any derived row that is
  // null/unbalanced means the helper and this mirror drifted.
  const badDerived = scalar(`
    select count(*) from public.invoices
    where vat_derived = true
      and (pretax is null or vat is null or total is null or total <= 0
           or abs((pretax + vat) - total) > greatest(0.05, total * 0.005))`)
  if (badDerived === '0') ok('כל השורות עם מע״מ מחושב (vat_derived) מאוזנות')
  else fail(`${badDerived} שורות vat_derived לא מאוזנות — סטייה בין vat-derivation.ts לחישוב בפועל`)

  const derivedCount = scalar(`select count(*) from public.invoices where vat_derived = true`)
  if (derivedCount !== '0') info(`${derivedCount} חשבוניות עם מע״מ מחושב מהסה״כ (vat_derived)`)
})
