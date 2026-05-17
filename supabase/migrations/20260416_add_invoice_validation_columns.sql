-- Add validation columns to invoices table.
--
-- Context: scanned invoices were silently saving wrong amounts because
-- there was no arithmetic validation between pretax/vat/total and no
-- audit trail of the AI's raw response.
--
-- needs_review     — true when arithmetic check fails or total is missing.
--                    UI must surface these and the accountant export must
--                    refuse to send them.
-- validation_error — Hebrew message explaining why the invoice was flagged.
-- extraction_raw   — full AI response (model, raw text, parsed JSON, source,
--                    timestamp). Lets us debug accuracy regressions later.

alter table public.invoices
  add column if not exists needs_review boolean not null default false,
  add column if not exists validation_error text,
  add column if not exists extraction_raw jsonb;

-- Quick filter for the alert / accountant-export checks.
create index if not exists invoices_needs_review_idx
  on public.invoices (needs_review)
  where needs_review = true;
