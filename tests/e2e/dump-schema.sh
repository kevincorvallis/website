#!/usr/bin/env bash
# Pull prod env and introspect the live Supabase schema (read-only). Cleans up the
# temp env file on exit. Run: bash tests/e2e/dump-schema.sh
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
ENVFILE="/tmp/dispatch-schema.env"
trap 'rm -f "$ENVFILE"' EXIT
vercel env pull "$ENVFILE" --environment=production --yes || { echo "env pull failed"; exit 1; }
DOTENV="$ENVFILE" node tests/e2e/dump-schema.js
