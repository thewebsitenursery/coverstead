#!/bin/bash
# Dedicated Coverstead backup job; credentials stay in its private data directory.
set +eu
source scl_source enable nodejs20
set -euo pipefail
app="$HOME/apps/coverstead"
exec 9>"$app/tmp/maintenance.lock"
flock -n 9 || exit 0
cd "$app/current"
export ENV_FILE="$app/data/backup.env"
node scripts/managed-offsite.js
