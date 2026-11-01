#!/usr/bin/env bash
#
# Usage:  scripts/deploy.sh
#
# One-command production deploy for InvoiceFlow. Deploys the current `main`
# from origin: pulls (fast-forward only), installs deps, builds (which runs
# the lint gate + prepare-standalone), restarts the systemd service, and
# waits for the app to answer a health check, then probes that src/proxy.ts is
# actually gating requests. Safe to run from anywhere.
#
# Node: the app builds and runs on its own Node 24 in /opt/node-24, never on the
# shared system node (which other apps on this host use). The script refuses to
# run on anything else, and checks the live process after the restart. Setup and
# the Node 20 rollback are in docs/RUNBOOK.md (Node).
#
# The "previous commit" the script prints is a reference point, NOT a command to
# run: it is the working tree's HEAD when the script started (already the new
# commit if main was pulled by hand first). Use it to see what was live before.
#
# To roll back (main is protected, so never reset it):
#   git revert <merge-commit>   # the commit being undone; squash-merged => an
#                               # ordinary commit, no -m needed
#   then open a PR, merge it (gh pr merge --squash --delete-branch), and run
#   scripts/deploy.sh again.
# Do NOT `git reset --hard`: the `git pull --ff-only` below would just bring the
# bad commit back from origin/main.
#
set -euo pipefail

# Work from the repo root regardless of where this was called from.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

UNIT="invoice.service"

# --- Node --------------------------------------------------------------------
# InvoiceFlow has its own Node 24 (NODE_PREFIX is a symlink to a pinned versioned
# directory). The build, the lint gate and pnpm must use the same Node the service
# runs on; the systemd drop-in invoice.service.d/node24.conf points the unit at it.
# pnpm is the corepack shim in that same bin dir, so its version comes from the
# `packageManager` field. PATH is changed for this script only.
NODE_PREFIX="/opt/node-24"
export PATH="$NODE_PREFIX/bin:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if [[ "$(command -v node || true)" != "$NODE_PREFIX/bin/node" || "$(node -v 2>/dev/null || true)" != v24.* ]]; then
  echo "✗ expected Node v24 from $NODE_PREFIX/bin, got '$(command -v node || echo none) $(node -v 2>&1 || true)' — see docs/RUNBOOK.md (Node)" >&2
  exit 1
fi
if [[ "$(command -v pnpm || true)" != "$NODE_PREFIX/bin/pnpm" ]]; then
  echo "✗ pnpm must be the corepack shim in $NODE_PREFIX/bin, got '$(command -v pnpm || echo none)' — see docs/RUNBOOK.md (Node)" >&2
  exit 1
fi
echo "→ node $(node -v), pnpm $(pnpm -v)"

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
echo "→ previous commit: $PREVIOUS (reference only, not a command; to roll back: git revert via PR, see header)"
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
HEALTHY=0
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 1
done

if [[ "$HEALTHY" -ne 1 ]]; then
  echo "✗ health check failed after 30s — recent logs:" >&2
  journalctl -u "$UNIT" -n 30 --no-pager >&2
  exit 1
fi

# --- Runtime Node check ------------------------------------------------------
# The build ran on Node 24, so the service must too. Without the systemd drop-in
# the unit would quietly fall back to the system node, so ask the live process.
MAINPID="$(systemctl show -p MainPID --value "$UNIT")"
LIVE_EXE="$(readlink -f "/proc/$MAINPID/exe" 2>/dev/null || true)"
case "$LIVE_EXE" in
  "$(readlink -f "$NODE_PREFIX")"/bin/node) ;;
  *)
    echo "✗ $UNIT (pid ${MAINPID:-?}) runs '${LIVE_EXE:-unknown}', expected $NODE_PREFIX/bin/node." >&2
    echo "  is the drop-in /etc/systemd/system/invoice.service.d/node24.conf installed and daemon-reloaded? (docs/RUNBOOK.md)" >&2
    echo "  the new build is already live, so fix the unit and restart, or roll back as described in the RUNBOOK." >&2
    exit 1
    ;;
esac
echo "✓ $UNIT runs on $("$LIVE_EXE" -v) ($LIVE_EXE)"

# --- Proxy probe -------------------------------------------------------------
# The health check above only curls `/`, which answers with or without the
# proxy, and every /api route re-checks auth itself — so a proxy that silently
# dropped out of the build would pass both. Neither path below exists, so only
# the proxy can answer them: 307 (→ /login) for a page, 401 for an /api path.
# A 404 means the proxy is not running.
probe_proxy() { # $1 = path, $2 = expected status
  local got
  got="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$PORT$1" || true)"
  if [[ "$got" != "$2" ]]; then
    echo "✗ proxy probe failed: GET $1 returned ${got:-no response}, expected $2." >&2
    echo "  src/proxy.ts is not gating requests in the build that is now live — recent logs:" >&2
    journalctl -u "$UNIT" -n 30 --no-pager >&2
    exit 1
  fi
}
probe_proxy /zz-proxy-probe 307
probe_proxy /api/zz-proxy-probe 401
echo "✓ proxy probe ok (/zz-proxy-probe → 307, /api/zz-proxy-probe → 401)"

NEW="$(git rev-parse --short HEAD)"
echo "✓ deploy ok: $PREVIOUS → $NEW"
