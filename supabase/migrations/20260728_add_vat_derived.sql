-- vat_derived: VAT was not printed/extractable (or the extracted pair did not
-- reconcile with the printed total); pretax+vat were computed deterministically
-- from total using the date-appropriate Israeli VAT rate
-- (src/lib/vat-derivation.ts). Soft marker only — derived rows are balanced by
-- construction and are sent to the accountant normally.
--
-- Apply manually: psql "$DIRECT_URL" -f supabase/migrations/20260728_add_vat_derived.sql

alter table public.invoices
  add column if not exists vat_derived boolean not null default false;
