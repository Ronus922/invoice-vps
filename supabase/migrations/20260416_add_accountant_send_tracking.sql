-- Track per-invoice delivery status to the accountant.
--
-- sent_to_accountant_at — non-null timestamp when the email was sent
--                         successfully via Gmail API.
-- accountant_send_error — Hebrew reason when send was skipped or failed
--                         (e.g. 'needs_review', 'gmail_not_connected',
--                         'send_failed', actual error text).
--
-- A row with sent_to_accountant_at IS NULL is "not sent" (whether
-- pending, blocked, or failed). The UI surfaces this in the table.

alter table public.invoices
  add column if not exists sent_to_accountant_at timestamptz,
  add column if not exists accountant_send_error text;

create index if not exists invoices_accountant_pending_idx
  on public.invoices (sent_to_accountant_at)
  where sent_to_accountant_at is null;
