-- Folder scan: files that were recognised as duplicates but could not be confirmed (their original row or its file could
-- not be verified) stay in the user's folder. Their SHA-256 is remembered here, so the next scans skip them BEFORE the
-- upload and the model extraction instead of re-reading (and re-billing) them every time.
-- ADDITIVE ONLY: one new table; no existing table, column, row or constraint is touched.
--
-- Applied manually (no migration runner), as the owner inside the DB container:
--   docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/20261111_add_folder_duplicate_hashes.sql
--
-- Only the authenticated /api/folder-hashes routes touch it, through the service role (RLS is bypassed there).
-- RLS is enabled with NO policy and every grant is revoked from the public roles: the anon key reads nothing.
CREATE TABLE IF NOT EXISTS public.folder_duplicate_hashes (
  sha256        text        PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  -- The row the file duplicates (always named: a duplicate nobody could name is not remembered). No foreign key on
  -- purpose: a deleted invoice must never block or cascade into this memory — the scan re-verifies the row each time,
  -- and a memory whose row is gone or confirmable is ignored.
  existing_id   uuid        NOT NULL,
  reason        text        NOT NULL DEFAULT 'unverified_duplicate',
  file_name     text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.folder_duplicate_hashes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.folder_duplicate_hashes FROM anon, authenticated;
GRANT ALL ON public.folder_duplicate_hashes TO service_role;

-- Rollback (nothing else depends on it): DROP TABLE public.folder_duplicate_hashes;
