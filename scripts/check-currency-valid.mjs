#!/usr/bin/env node
// INVARIANT: every invoice carries a valid ISO-4217 currency code.
//   Foreign invoices (AWS, Anthropic, Google) stored without an explicit code
//   were silently booked as ₪ — wrong totals in the accounting books. currency
//   is NOT NULL default 'ILS'; this asserts it is always a 3-letter code.
// Read-only against the real DB.
import { run, scalar, fail, ok } from './_lib.mjs'

run('check-currency-valid', async () => {
  const bad = scalar(`
    select count(*) from public.invoices
    where currency is null or currency !~ '^[A-Z]{3}$'`)
  if (bad === '0') ok('לכל החשבוניות קוד מטבע תקין (ISO-4217)')
  else {
    fail(`${bad} חשבוניות עם מטבע חסר/לא תקין`)
    const sample = scalar(`
      select string_agg(distinct coalesce(currency,'<null>'), ', ')
      from public.invoices where currency is null or currency !~ '^[A-Z]{3}$'`)
    if (sample) console.error('  · ערכים שנמצאו: ' + sample)
  }
})
