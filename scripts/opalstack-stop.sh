#!/bin/bash
set -euo pipefail
APPDIR=${COVERSTEAD_APP_DIR:-"$HOME/apps/coverstead"}
PIDFILE="$APPDIR/tmp/node.pid"
if [ ! -f "$PIDFILE" ]; then echo "Coverstead is already stopped."; exit 0; fi
read -r pid < "$PIDFILE"
if ! [[ "$pid" =~ ^[0-9]+$ ]] || [ "$pid" -le 1 ]; then echo "Invalid Coverstead PID." >&2; exit 1; fi
if ! kill -0 "$pid" 2>/dev/null; then rm "$PIDFILE"; echo "Coverstead is stopped."; exit 0; fi
cwd=$(readlink -f "/proc/$pid/cwd")
case "$cwd" in "$APPDIR"/releases/*) ;; *) echo "PID does not belong to a Coverstead release; refusing to signal it." >&2; exit 1;; esac
executable=$(readlink -f "/proc/$pid/exe")
if [ "${executable##*/}" != node ] || ! tr '\0' '\n' < "/proc/$pid/cmdline" | grep -Eq '^(server|managed-gateway)\.js$'; then
  echo "PID is not the Coverstead Node server; refusing to signal it." >&2; exit 1
fi
kill -TERM "$pid"
for attempt in {1..150}; do
  if ! kill -0 "$pid" 2>/dev/null || [ "$(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null || true)" = Z ]; then
    rm "$PIDFILE"; echo "Stopped Coverstead."; exit 0
  fi
  sleep 0.1
done
echo "Coverstead has not stopped; inspect PID $pid before continuing." >&2
exit 1
