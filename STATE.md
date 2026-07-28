# STATE

Branch: `testing/invariant-suite` (from `main`)

## Status: doc_type identity key added; `npm run check:all` green

Document identity is now `(vendor, doc_number, doc_type)` — a vendor can issue an
Invoice and a Receipt (or חשבונית מס / קבלה / חשבונית מס-קבלה / חשבונית זיכוי) under
one number. Standing invariant harness still green (exit 0):
`typecheck → lint → 8 invariant checks`.

## doc_type work (2026-07-18)

- **Schema:** `20260718_add_doc_type.sql` — `doc_type text not null default 'unknown'`
  + CHECK (`invoice, receipt, invoice_receipt, credit_note, other, unknown`) + a
  **partial** unique index on `(vendor, doc_number, doc_type)` anchored at
  `created_at >= max+1s`, protecting new data now without waiting for legacy.
- **Backfill:** `scripts/backfill-doc-type.mjs` (backup → migrate → classify →
  unify → verify → index). Distribution: unknown 296 / invoice 65 / receipt 44.
  8 of the 17 old variant groups (all Anthropic) auto-split into invoice+receipt;
  9 remain for Ronen's UI resolution (see TESTING.md).
- **Write-time dedup:** `/api/invoices` POST returns `{ duplicate: true }` on the
  index conflict (23505) instead of creating a dup — closes the racy-rescan and
  parallel-scan window. Same key extended to `scan-gmail` dedup, `UploadZone` +
  `folder-watch` pre-checks, and Drive/ZIP backup filenames.
- **check:dupes** rewritten to the new key; throwaway-DB proof now covers the
  partial index (incl. legacy grandfathering) AND the full index.

## What's on this branch

- `scripts/_lib.mjs` + 8 `scripts/check-*.mjs` — one invariant each:
  secrets, api-auth, source-enum, anon-isolation, money-balanced, currency,
  review-not-sent, no-duplicate-invoices. Run standalone (`npm run check:money`)
  or all via `npm run check:all`. DB checks are read-only against real data; the
  only write test (dupe unique-index proof) runs on a throwaway DB it creates+drops.
- `src/lib/doc-type.ts` — `DocType` enum + `normalizeDocType()` (mirrors the DB CHECK).
- `package.json` — `typecheck` + `check:*` + `check:all` scripts.
- `TESTING.md` — per-check protection, manual browser test plan, deploy rule,
  and the open data-backlog items.
- One-off ops scripts (kept for auditability): `backfill-doc-type.mjs`,
  `dedup-cleanup.mjs`, `reextract-legacy.mjs`, `apply-reextract.mjs`.
- `.gitignore` — `backups/` (never commit DB dumps).

## Fixed this session (real breakage the checks found)

- **Duplicate invoices:** 20 `(vendor, doc_number)` dup groups existed with no
  DB constraint (racy re-scan in `folder-watch.ts`). Collapsed 5 byte-identical
  re-scan rows (412→407 after backups). 17 variant groups (invoice vs receipt,
  manual vs auto) left for manual UI resolution — see TESTING.md.
- **Silent money errors:** 11 legacy invoices (03–05/2026) had `pretax+vat ≠
  total`, unflagged, already sent to the accountant. Re-extracted from source
  PDFs: 8 corrected to right amounts, 3 flagged `needs_review` (credit note +
  two discount cases) — tracked in `KNOWN_BACKLOG` for corrected re-send.

## Open backlog (human action)

1. 9 duplicate variant groups → resolve in UI, then DROP the partial index and
   create the full unique index (SQL in TESTING.md).
2. 3 `KNOWN_BACKLOG` invoices → send corrected copy to accountant, clear
   `needs_review`, remove id from `check-needs-review-not-sent.mjs`.

## Backups (gitignored, on server)

`backups/doctype-*/` (full table dump + JSON), `backups/dedup-*/`,
`backups/reextract-*.json`, `backups/pre-correction-*.json`.
