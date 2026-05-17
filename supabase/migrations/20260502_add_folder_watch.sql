-- Folder watch tracking (browser File System Access API scans)

ALTER TABLE gmail_tokens
  ADD COLUMN IF NOT EXISTS last_folder_scan_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_folder_scan_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_folder_scan_error text;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_source_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'gmail'::text, 'whatsapp'::text, 'folder'::text]));
