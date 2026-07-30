-- Scan observability + atomic counters.
-- Applied manually (no migration runner):
--   psql "$DIRECT_URL" -f supabase/migrations/20260730_add_scan_observability.sql
--
-- 1) skipped_attachments: per-message log of vetoed attachments
--    [{"filename": "...", "reason": "negative_keyword:הצעת מחיר"}, ...]
--    Makes filter rejections auditable and lets the scanner re-open messages
--    vetoed under older filter rules.
-- 2) filter_version: the keyword-filter version that last judged this message.
--    When the filter improves (FILTER_VERSION bump in scan-gmail/route.ts),
--    messages vetoed under an older version are re-scanned exactly once.
alter table public.scanned_emails
  add column if not exists skipped_attachments jsonb not null default '[]'::jsonb;
alter table public.scanned_emails
  add column if not exists filter_version integer;

-- 3) Atomic scan-total counters — replaces a read-then-write in the app that
--    lost counts when two scans overlapped (cron + manual).
create or replace function public.increment_scan_totals(p_scanned integer, p_found integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.gmail_tokens
  set last_scan_completed_at = now(),
      total_scanned_messages = coalesce(total_scanned_messages, 0) + p_scanned,
      total_found_invoices  = coalesce(total_found_invoices, 0) + p_found
  where id = 'default';
$$;

revoke execute on function public.increment_scan_totals(integer, integer) from public, anon, authenticated;

-- 4) accountant-send looks rows up by file_url (no index existed).
create index if not exists invoices_file_url_idx on public.invoices (file_url);
