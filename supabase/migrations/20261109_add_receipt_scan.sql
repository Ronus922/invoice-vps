-- Receipt scan: a paper receipt photographed on the phone enters the SAME
-- invoices table / bucket / accountant pipeline as an e-mailed document.
-- ADDITIVE ONLY: one CHECK is widened, three nullable columns are added; no row
-- is touched and no existing value changes meaning.
--
-- Applied manually (no migration runner). The app role `invoice_app` is not the
-- table owner, so run it as the owner inside the DB container:
--   docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/20261109_add_receipt_scan.sql
--
-- 1) source: 'scan' joins the allowed values. scripts/check-source-enum.mjs keeps
--    this list identical to the z.enum in src/app/api/invoices/route.ts.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_source_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'gmail'::text, 'whatsapp'::text, 'folder'::text, 'scan'::text]));

-- 2) Who scanned it (the session user's auth id) — NULL for every other source.
--    No foreign key on purpose: a deleted auth user must never block or cascade
--    into the accounting record.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS scanned_by uuid;

-- 3) Weight of the stored JPEG in bytes (the compression ladder aims at 300KB).
--    NULL for every row that was not scanned.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS image_bytes integer;

-- 4) The issuer's tax id (ח.פ / עוסק מורשה) as printed on the receipt. Read by the
--    OCR, corrected by hand before saving. NULL when absent.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vendor_tax_id text;

-- Rollback (nothing depends on these until the feature is deployed):
--   ALTER TABLE invoices DROP COLUMN IF EXISTS vendor_tax_id, DROP COLUMN IF EXISTS image_bytes, DROP COLUMN IF EXISTS scanned_by;
--   (and restore the CHECK above without 'scan' — only valid while no row has source='scan')
