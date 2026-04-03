#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STANDALONE_DIR="$ROOT_DIR/.next/standalone"

if [[ ! -d "$STANDALONE_DIR" ]]; then
  exit 0
fi

ln -sfn "$ROOT_DIR/public" "$STANDALONE_DIR/public"
ln -sfn "$ROOT_DIR/.env.local" "$STANDALONE_DIR/.env.local"
mkdir -p "$STANDALONE_DIR/.next"
ln -sfn "$ROOT_DIR/.next/static" "$STANDALONE_DIR/.next/static"

mkdir -p "$STANDALONE_DIR/.next/server"

for file in \
  "$ROOT_DIR/.next/routes-manifest.json" \
  "$ROOT_DIR/.next/app-path-routes-manifest.json" \
  "$ROOT_DIR/.next/server/app-paths-manifest.json" \
  "$ROOT_DIR/.next/server/middleware-manifest.json" \
  "$ROOT_DIR/.next/server/middleware-build-manifest.js" \
  "$ROOT_DIR/.next/server/middleware.js"; do
  if [[ -f "$file" ]]; then
    cp -f "$file" "$STANDALONE_DIR/.next/server/$(basename "$file")"
  fi
done
