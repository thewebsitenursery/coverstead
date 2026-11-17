#!/bin/bash
# Intended for a Coverstead-only scheduler entry. Never edits other cron jobs.
set +eu
source scl_source enable nodejs20
set -euo pipefail
app="$HOME/apps/coverstead"
mkdir -p "$app/tmp"
exec 9>"$app/tmp/maintenance.lock"
flock -n 9 || exit 0
test -d "$app/current"
cd "$app/current"
export ENV_FILE="$app/data/config.env"
port=$(node --input-type=module -e 'import "./env.js"; console.log(Number(process.env.PORT))')
if ! curl --max-time 10 -fsS -H 'X-Coverstead-Check: 1' -H 'Host: coverstead.net' "http://127.0.0.1:$port/api/platform" >/dev/null; then
  # The scoped stop script verifies executable/cwd/PID before signalling it.
  "$app/stop" || true
  "$app/start" || true
fi
timeout 45s node scripts/managed-alert.js
