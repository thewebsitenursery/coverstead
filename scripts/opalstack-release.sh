#!/bin/bash
# Reads a previously uploaded Community archive. This script can deploy only
# $HOME/apps/coverstead, never an app directory supplied by an argument or env.
set -euo pipefail
release_id=${1:-}
if [ "$#" != 1 ] || ! [[ "$release_id" =~ ^[0-9]{8}-[0-9]{2}$ ]]; then
  echo 'Usage: bash scripts/opalstack-release.sh YYYYMMDD-NN' >&2; exit 2
fi
set +eu
source scl_source enable nodejs20
set -euo pipefail
app="$HOME/apps/coverstead"
mkdir -p "$app/tmp"
exec 9>"$app/tmp/maintenance.lock"
flock -n 9 || { echo 'Coverstead maintenance is already running.' >&2; exit 1; }
test -d "$app/data"
test -f "$app/start"
test -f "$app/stop"
old=$(readlink -f "$app/current")
case "$old" in "$app"/releases/*/coverstead-community) ;; *) echo 'Current release is outside Coverstead.' >&2; exit 1;; esac
port=$(cd "$old"; ENV_FILE="$app/data/config.env" node --input-type=module -e 'import "./env.js";const p=Number(process.env.PORT);if(!Number.isInteger(p)||p<1024||p>65535)process.exit(1);console.log(p)')
archive="$app/releases/$release_id.zip"
destination="$app/releases/$release_id"
test -f "$archive"
test ! -e "$destination"
python3 - "$archive" <<'ZIPCHECK'
import sys, zipfile, stat
with zipfile.ZipFile(sys.argv[1]) as archive:
    items=archive.infolist()
    if len(items)>500 or sum(item.file_size for item in items)>100_000_000: raise SystemExit('Archive is too large.')
    names=[item.filename for item in items]
    if len(names)!=len(set(names)): raise SystemExit('Duplicate archive entries.')
    for item in items:
        name=item.filename
        if not name.startswith('coverstead-community/') or chr(92) in name or any(part in ('.','..') for part in name.split('/')): raise SystemExit('Unsafe archive path.')
        mode=item.external_attr>>16
        if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) and not (stat.S_ISREG(mode) or stat.S_ISDIR(mode))): raise SystemExit('Only regular source files are accepted.')
    if 'coverstead-community/server.js' not in names: raise SystemExit('Missing application source.')
ZIPCHECK
mkdir "$destination"
unzip -q "$archive" -d "$destination"
release="$destination/coverstead-community"
if cmp -s "$old/package-lock.json" "$release/package-lock.json"; then
  cp -a "$old/node_modules" "$release/node_modules"
else
  (cd "$release"; npm ci --omit=dev --ignore-scripts)
fi
mkdir -p "$release/public/downloads"
cp "$archive" "$release/public/downloads/coverstead-community.zip"
(cd "$release"; ENV_FILE=/dev/null npm test) > "$app/releases/$release_id-tests.txt"
tail -n 9 "$app/releases/$release_id-tests.txt"
stopped=0
switched=0
recover(){
  result=$?
  if [ "$stopped" = 1 ]; then
    if [ "$switched" = 1 ]; then "$app/stop" || true; fi
    ln -sfn "$old" "$app/current"
    "$app/start" || true
  fi
  exit "$result"
}
trap recover ERR
"$app/stop"
stopped=1
(cd "$old"; ENV_FILE="$app/data/config.env" npm run backup) | tee "$app/releases/$release_id-backup.txt"
ln -sfn "releases/$release_id/coverstead-community" "$app/current"
switched=1
"$app/start"
healthy=0
for attempt in {1..30}; do
  if curl -fsS -H 'Host: coverstead.net' -H 'X-Coverstead-Check: 1' "http://127.0.0.1:$port/api/platform" > /dev/null; then healthy=1; break; fi
  sleep 0.5
done
test "$healthy" = 1
test "$(curl -s -H 'Host: coverstead.net' -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/admin/bookings")" = 401
curl -fsS -H 'Host: coverstead.net' -H 'X-Coverstead-Check: 1' "http://127.0.0.1:$port/manual" | grep 'Full user manual' > /dev/null
trap - ERR
echo "Coverstead release $release_id is healthy; previous source and backup retained."
