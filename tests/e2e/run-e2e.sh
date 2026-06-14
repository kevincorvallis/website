#!/usr/bin/env bash
# One-shot: pull prod env, provision the @e2ebot test account, run the publish
# harness, and always clean up the temp env file. Run from your own shell:
#
#   bash tests/e2e/run-e2e.sh
#
# The service-role key only ever lives in /tmp/dispatch-e2e.env on your machine,
# is read directly by the provisioner (no shell sourcing), and is deleted on exit.

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

ENVFILE="/tmp/dispatch-e2e.env"
trap 'rm -f "$ENVFILE"' EXIT

vercel env pull "$ENVFILE" --environment=production --yes || { echo "env pull failed"; exit 1; }

DOTENV="$ENVFILE" E2E_RUN=1 node tests/e2e/provision-test-account.js
