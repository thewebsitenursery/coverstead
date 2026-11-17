#!/bin/bash
# Dedicated to this Coverstead installation. Do not reuse another app's port or PID.
APPDIR=${COVERSTEAD_APP_DIR:-"$HOME/apps/coverstead"}
# The provider's activation script is not compatible with errexit/nounset.
source scl_source enable nodejs20
set -euo pipefail
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)'
PROJECTDIR=$(readlink -f "$APPDIR/current")
case "$PROJECTDIR" in "$APPDIR"/releases/*) ;; *) echo "Invalid Coverstead release path." >&2; exit 1;; esac
test -f "$PROJECTDIR/server.js"
test -f "$APPDIR/data/config.env"
mkdir -p "$APPDIR/tmp" "$APPDIR/logs"
PIDFILE="$APPDIR/tmp/node.pid"
if [ -f "$PIDFILE" ]; then
  read -r pid < "$PIDFILE"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    echo "Coverstead PID is already active; inspect it before starting." >&2
    exit 1
  fi
fi
export ENV_FILE="$APPDIR/data/config.env"
entrypoint=server.js
if [ -f "$APPDIR/data/managed-enabled" ]; then entrypoint=managed-gateway.js; fi
/usr/sbin/daemonize -c "$PROJECTDIR" -a -e "$APPDIR/logs/error.log" -o "$APPDIR/logs/console.log" -p "$PIDFILE" "$(command -v node)" "$entrypoint"
echo "Started Coverstead."
