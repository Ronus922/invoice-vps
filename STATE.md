# STATE

Branch: `testing/invariant-suite` (from `main`)

## Status: permanent invariant test suite added; `npm run check:all` green

Built a standing test harness for the project's critical invariants and fixed
the real data-integrity issues it surfaced. All gates pass (exit 0):
`typecheck → lint → 7 invariant checks`.

## What's on this branch

- `scripts/_lib.mjs` + 7 `scripts/check-*.mjs` — one invariant each:
  secrets, api-auth, anon-isolation, money-balanced, currency, review-not-sent,
  no-duplicate-invoices. Run standalone (`npm run check:money`) or all via
  `npm run check:all`. DB checks are read-only against real data; the only
  write test (dupe unique-index proof) runs on a throwaway DB it creates+drops.
- `package.json` — `typecheck` + `check:*` + `check:all` scripts.
- `TESTING.md` — per-check protection, manual browser test plan, deploy rule,
  and the two open data-backlog items.
- One-off ops scripts (kept for auditability): `dedup-cleanup.mjs`,
  `reextract-legacy.mjs`, `apply-reextract.mjs`.
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

1. 17 duplicate variant groups → resolve in UI, then add the full unique index
   (SQL in TESTING.md).
2. 3 `KNOWN_BACKLOG` invoices → send corrected copy to accountant, clear
   `needs_review`, remove id from `check-needs-review-not-sent.mjs`.

## Backups (gitignored, on server)

`backups/dedup-*/` (table dump + dup JSON), `backups/reextract-*.json`,
`backups/pre-correction-*.json`.
