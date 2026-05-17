-- Add currency support to invoices.
--
-- Context: invoices were stored as raw numbers with no currency code, and
-- the UI hard-coded ₪. Foreign invoices (AWS, Anthropic, Google) were saved
-- as if they were NIS — wrong totals in accounting books. We now store an
-- explicit ISO 4217 code per invoice.
--
-- Default 'ILS' preserves the accounting meaning of all existing rows
-- (the historical assumption was Israeli shekel).

alter table public.invoices
  add column if not exists currency text not null default 'ILS';

create index if not exists invoices_currency_idx
  on public.invoices (currency);
