-- Drive backup tracking

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS backed_up_to_drive_at timestamptz,
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_backup_error text;

ALTER TABLE gmail_tokens
  ADD COLUMN IF NOT EXISTS drive_root_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_backup_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_drive_backup_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_drive_backup_error text;

CREATE INDEX IF NOT EXISTS idx_invoices_backup_pending
  ON invoices (created_at)
  WHERE backed_up_to_drive_at IS NULL;
