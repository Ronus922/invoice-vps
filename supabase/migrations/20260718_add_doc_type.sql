-- Add doc_type: the document-type dimension of invoice identity.
--
-- Context: a vendor can legitimately issue more than one document under the SAME
-- doc_number — Anthropic emits an "Invoice" and a "Receipt" with one number, and
-- Israeli practice has חשבונית מס / קבלה / חשבונית מס-קבלה / חשבונית זיכוי. The
-- identity key of a document is therefore (vendor, doc_number, doc_type), NOT
-- (vendor, doc_number) alone.
--
-- Allowed values (printed type → code):
--   חשבונית מס                      → invoice
--   קבלה                            → receipt
--   חשבונית מס קבלה                  → invoice_receipt
--   חשבונית זיכוי                    → credit_note
--   Invoice / Tax Invoice           → invoice
--   Receipt                         → receipt
--   Credit Note                     → credit_note
--   any other printed document type → other
--   can't determine                 → unknown
--
-- Default 'unknown' is SAFE by construction: adding doc_type to the key only
-- *softens* uniqueness (an Invoice and a Receipt that used to collide can now
-- coexist) — it never tightens it, so no existing row can be invalidated.

alter table public.invoices
  add column if not exists doc_type text not null default 'unknown';

alter table public.invoices drop constraint if exists invoices_doc_type_check;
alter table public.invoices add constraint invoices_doc_type_check
  check (doc_type in ('invoice','receipt','invoice_receipt','credit_note','other','unknown'));

-- Partial UNIQUE index — protects NEW data immediately, without waiting for the
-- legacy variant groups to be resolved in the UI. Anchored just after the latest
-- existing row (max(created_at)+1s = the timestamp below) so that NO legacy row
-- is covered — including the same-day להב יעדים duplicates created earlier today —
-- which guarantees the index builds. Every row inserted from now on is deduped
-- on (vendor, doc_number, doc_type).
--
-- FINISH STEP (after Ronen resolves the remaining groups — see TESTING.md):
--   drop index public.invoices_vendor_docnum_doctype_new_uniq;
--   create unique index concurrently invoices_vendor_docnum_doctype_uniq
--     on public.invoices (vendor, doc_number, doc_type)
--     where coalesce(doc_number,'') <> '';
create unique index if not exists invoices_vendor_docnum_doctype_new_uniq
  on public.invoices (vendor, doc_number, doc_type)
  where coalesce(doc_number,'') <> '' and created_at >= '2026-07-18 22:16:09.647383+00';
