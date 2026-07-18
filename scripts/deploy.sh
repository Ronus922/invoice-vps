#!/usr/bin/env bash
#
# Usage:  scripts/deploy.sh
#
# One-command production deploy for InvoiceFlow. Deploys the current `main`
# from origin: pulls (fast-forward only), installs deps, builds (which runs
# the lint gate + prepare-standalone), restarts the systemd service, and
# waits for the app to answer a health check. Safe to run from anywhere.
#
# Rollback point: the script prints the previous commit before pulling.
# To roll back:  git reset --hard <previous>  &&  scripts/deploy.sh
#
set -euo pipefail

# Work from the repo root regardless of where this was called from.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

UNIT="invoice.service"

# --- Safety checks -----------------------------------------------------------
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ working tree is not clean — commit or stash before deploying:" >&2
  git status --short >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "✗ current branch is '$BRANCH', deploy runs from 'main' only." >&2
  echo "  switch with: git checkout main" >&2
  exit 1
fi

# --- Update code -------------------------------------------------------------
PREVIOUS="$(git rev-parse --short HEAD)"
echo "→ previous commit: $PREVIOUS (rollback point)"
git pull --ff-only

# --- Install deps ------------------------------------------------------------
# --prod=false is DELIBERATE: it overrides any NODE_ENV=production that may be
# present in the shell so devDependencies (eslint) are always installed. The
# build's lint gate needs eslint — without it `pnpm build` fails on a missing
# command. Do NOT remove this flag.
pnpm install --frozen-lockfile --prod=false

# --- Build (lint gate + next build + prepare-standalone) ---------------------
pnpm build

# --- Restart service ---------------------------------------------------------
sudo systemctl restart "$UNIT"

# --- Health check ------------------------------------------------------------
# PORT lives in the root-only service env file; read it if we can, else 3002.
PORT="$(sudo -n grep -oP '^PORT=\K.*' /etc/invoice/invoice.env 2>/dev/null || true)"
PORT="${PORT:-3002}"

echo "→ waiting for http://127.0.0.1:$PORT ..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
    NEW="$(git rev-parse --short HEAD)"
    echo "✓ deploy ok: $PREVIOUS → $NEW"
    exit 0
  fi
  sleep 1
done

echo "✗ health check failed after 30s — recent logs:" >&2
journalctl -u "$UNIT" -n 30 --no-pager >&2
exit 1
