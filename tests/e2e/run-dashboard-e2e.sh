#!/usr/bin/env bash
# Real integration test of the DEPLOYED dashboard. Pulls prod env, ensures the
# @e2ebot account exists with a known ephemeral password, then runs the dashboard
# harness against BASE (default https://klee.page). Cleans up the temp env file.
#
# Run AFTER deploying the dashboard to prod:  bash tests/e2e/run-dashboard-e2e.sh
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
ENVFILE="/tmp/dispatch-dash.env"
trap 'rm -f "$ENVFILE"' EXIT
vercel env pull "$ENVFILE" --environment=production --yes || { echo "env pull failed"; exit 1; }

PW="E2eDash-$(date +%s)-ok"
DOTENV="$ENVFILE" E2E_PASSWORD="$PW" node tests/e2e/provision-test-account.js >/dev/null 2>&1 \
    || { echo "provision failed"; exit 1; }

DISPATCH_TEST_EMAIL="e2ebot@klee.page" \
DISPATCH_TEST_PASSWORD="$PW" \
DISPATCH_BASE_URL="${DISPATCH_BASE_URL:-https://klee.page}" \
    node tests/e2e/dashboard-harness.js
