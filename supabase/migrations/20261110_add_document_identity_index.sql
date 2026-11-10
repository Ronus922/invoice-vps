-- Unique index on the DOCUMENT IDENTITY (docs/document-identity.md, src/lib/doc-identity.ts):
--   normalised doc_number + date + total (in cents)
-- The same document can never be stored twice, whatever the vendor's spelling or the doc_type.
--
-- Applied 2026-11-10, after the duplicate cleanup left ZERO rows sharing a key (781 rows checked: the key below equals
-- the TypeScript identity on every row, and no key occurs twice). ADDITIVE ONLY: one index, no row is touched.
--
-- Apply as the table owner inside the DB container. CREATE INDEX CONCURRENTLY cannot run inside a transaction, so
-- do NOT use psql -1 / --single-transaction, and keep this file free of BEGIN/COMMIT:
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261110_add_document_identity_index.sql
-- A failed concurrent build leaves an INVALID index behind: check `select indisvalid from pg_index where indexrelid =
-- 'public.invoices_document_identity_uniq'::regclass`, drop it and build again.
--
-- The expression mirrors normalizeDocNumber / normalizeDocDate / totalToCents:
--   number: NFKC, upper-case, letters and digits only, no leading zeros
--   date:   DD/MM/YYYY, DD.MM.YY, D-M-YY and YYYY-MM-DD read as YYYY-MM-DD; missing / '<UNKNOWN>' = '' (two empty dates
--           are equal; an empty date never equals a real one); a date that is written but unreadable = NO identity
--   total:  round(total * 100); a zero total = NO identity (the sign is part of it: a credit note differs from its invoice)
-- NULL keys (no number, zero total, unreadable date) are never duplicates: a unique index treats NULLs as distinct.
--
-- Deliberately coarse, like the app's own check: the vendor and doc_type are not in the key, and the "tax id only when both
-- sides have one" rule cannot be expressed in an index. A day that does not exist (31/02) reads as a date here; the app
-- treats it as unreadable (no identity) — such a row would only collide with an identical one.
-- A violation (23505) is reported as a duplicate by every writer: POST /api/invoices, the Gmail scan and the phone scan;
-- an edit (PATCH) answers 409.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS invoices_document_identity_uniq
  ON public.invoices ((CASE
  WHEN ltrim(regexp_replace(upper(normalize(doc_number, NFKC)), '[^[:alnum:]]', '', 'g'), '0') = '' THEN NULL
  WHEN round(total * 100) = 0 THEN NULL
  WHEN (CASE
          WHEN date IS NULL OR btrim(date) = '' OR btrim(date) ~* '^<?unknown>?$' THEN ''
          WHEN btrim(date) ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN btrim(date)
          WHEN btrim(date) ~ '^(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-]([0-9]{2}|[0-9]{4})$'
            THEN (CASE WHEN length((regexp_match(btrim(date), '^(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-]([0-9]{2}|[0-9]{4})$'))[3]) = 2 THEN '20' ELSE '' END)
              || (regexp_match(btrim(date), '^(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-]([0-9]{2}|[0-9]{4})$'))[3]
              || '-' || lpad((regexp_match(btrim(date), '^(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-]([0-9]{2}|[0-9]{4})$'))[2], 2, '0')
              || '-' || lpad((regexp_match(btrim(date), '^(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-]([0-9]{2}|[0-9]{4})$'))[1], 2, '0')
          ELSE NULL
        END) IS NULL THEN NULL
  ELSE ltrim(regexp_replace(upper(normalize(doc_number, NFKC)), '[^[:alnum:]]', '', 'g'), '0')
       || '|' ||
       (CASE
          WHEN date IS NULL OR btrim(date) = '' OR btrim(date) ~* '^<?unknown>?$' THEN ''
          WHEN btrim(date) ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN btrim(date)
          ELSE (CASE WHEN length((regexp_match(btrim(date), '^(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-]([0-9]{2}|[0-9]{4})$'))[3]) = 2 THEN '20' ELSE '' END)
              || (regexp_match(btrim(date), '^(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-]([0-9]{2}|[0-9]{4})$'))[3]
              || '-' || lpad((regexp_match(btrim(date), '^(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-]([0-9]{2}|[0-9]{4})$'))[2], 2, '0')
              || '-' || lpad((regexp_match(btrim(date), '^(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-]([0-9]{2}|[0-9]{4})$'))[1], 2, '0')
        END)
       || '|' || (round(total * 100))::bigint::text
END));
