#!/bin/bash
# Install as a root-owned helper on the dedicated Coverstead VM only.
# The operator owns the wrapper, config and image selection; never source venue input.
set -euo pipefail
base=${COVERSTEAD_OPERATIONS_ROOT:-/srv/coverstead/staging}
test -f /etc/coverstead-staging
test "$base" = /srv/coverstead/staging -o "$base" = /srv/coverstead/production
test -d "$base/operations"
test -x /usr/local/sbin/coverstead-compose
exec 9>"$base/operations/maintenance.lock"
case "${1:-}" in
 monitor)
  if ! timeout 20s /usr/local/sbin/coverstead-compose exec -T coverstead node scripts/managed-health.js --workers-only; then
   # Backup or deployment holds this lock. Health checks still run, but never
   # restart a writer during another maintenance operation.
   if flock -n 9; then
    now=$(date +%s)
    last=0
    if test -f "$base/operations/last-restart"; then read -r last < "$base/operations/last-restart"; fi
    [[ "$last" =~ ^[0-9]+$ ]] || exit 1
    if (( now-last >= 900 )); then
     printf '%s\n' "$now" > "$base/operations/last-restart"
     timeout 60s /usr/local/sbin/coverstead-compose restart coverstead
     # Compose returns when the process starts, before workers finish opening
     # their databases. Give real HTTP checks a bounded recovery window.
     deadline=$((SECONDS+30))
     until timeout 8s /usr/local/sbin/coverstead-compose exec -T coverstead node scripts/managed-health.js --workers-only >/dev/null 2>&1; do
      (( SECONDS < deadline )) || break
      sleep 1
     done
    fi
    flock -u 9
   fi
  fi
  timeout 35s /usr/local/sbin/coverstead-compose exec -T coverstead node scripts/managed-alert.js
  ;;
 backup)
  flock -n 9 || exit 0
  read -r image < "$base/operations/image"
  [[ "$image" =~ ^coverstead-managed:[a-zA-Z0-9._-]+$ ]] || exit 1
  # Credentials exist only in this disposable operator container. The web
  # container never receives the backup key or encryption password.
  # A failed or interrupted attempt remains visible to the app monitor until
  # a complete verified run succeeds. The data directory contains no key.
  cleanup_backup() {
   result=$?
   docker rm -f coverstead-offsite-job >/dev/null 2>&1 || true
   if test -f "$base/data/offsite-status.json"; then chown 1000:1000 "$base/data/offsite-status.json"; fi
   if (( result == 0 )); then
    rm -f "$base/data/offsite-failed"
   else
    touch "$base/data/offsite-failed"
    chmod 644 "$base/data/offsite-failed"
   fi
   exit "$result"
  }
  trap cleanup_backup EXIT
  timeout --signal=TERM --kill-after=30s 900s docker run --rm --init --name coverstead-offsite-job --hostname coverstead-offsite \
   --user 1000:1000 --read-only --cap-drop ALL --security-opt no-new-privileges \
   --memory 1g --pids-limit 128 --tmpfs /tmp:rw,noexec,nosuid,size=128m \
   --mount "type=bind,src=$base/data,dst=/var/lib/coverstead" \
   --mount "type=bind,src=$base/operations/backup-input,dst=/run/coverstead-operations,readonly" \
   -e ENV_FILE=/run/coverstead-operations/backup.env \
   -e RESTIC_CACHE_DIR=/tmp/restic-cache \
   "$image" node scripts/managed-offsite.js
  ;;
 *) echo 'Usage: cloud-maintenance.sh monitor|backup' >&2; exit 2;;
esac
