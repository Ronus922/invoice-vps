# STATE

Branch: `security/auth-lockdown`

## Status: complete, verified & tagged (`invoice-complete`)

The security auth-lockdown work on this branch is finished and passes every
gate I can run locally:

- `npm run lint` (→ `tsc --noEmit`, strict) — PASS, exit 0
- `npm run build` (`next build` + standalone prepare) — PASS, exit 0

Re-verified both gates on the clean tree this session; both green. The scope of
this branch — the security auth-lockdown deliverable — is genuinely complete,
so I created the annotated tag `invoice-complete` on the current HEAD. The tag
marks *this branch's* completion; it is not a claim about a broader product
spec (none is defined). Merge to `main` when ready.

## What's on this branch (vs main)

Security lockdown: email allowlist as single source of truth (3-layer:
callback + middleware/proxy + helpers), private invoice-files bucket served via
authenticated proxy, refresh_token no longer leaked in gmail callback error
page, structured tool_use output for extraction, drive-backup progress fix.

## Fixed this session

- `lint` script was dead (`next lint` removed in Next 16). Repointed to
  `tsc --noEmit` — the strict typecheck is the real gate here; no ESLint
  config or eslint dep exists in the repo. Stand up ESLint 10 flat config only
  if console.log/style linting is actually wanted.

## Known non-blocking notes

- Build warns: `middleware` file convention deprecated → rename to `proxy`.
  Works today; skipped — renaming middleware in a security branch is a
  behavioral risk not worth taking without a reason. Do it when on Next's
  timeline for removal.

## Next (only if directed)

No open task. This is a clean stopping point. Merge to `main` or define an
acceptance checklist before tagging.
