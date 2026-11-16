# Coverstead operations

Run one Node process per venue/database. Stop the app before using database maintenance scripts. The application writes an atomic SQLite snapshot after each transaction and holds a process lock; do not remove an active lock or run a second worker.

## Configuration

`env.js` reads `ENV_FILE` when set, otherwise `data/config.env` if it exists, otherwise `.env`. Existing environment variables take precedence. Keep configuration readable only by the service owner (mode 600); protect its containing directory (mode 700). It contains the owner installation token and may contain SMTP credentials.

Use the exact public HTTPS origin for `PUBLIC_URL` and `COOKIE_SECURE=true` on the server. Keep `DEMO_MODE=false`, `ONLINE_DEPOSITS_ENABLED=false` and `EMAIL_DNS_READY=false` until the relevant supported setup is complete. Online deposits are unverified and should remain disabled in this pilot. `EDITION=community` is the default; `enterprise` enables team administration without creating a subscription.

## Back up

Stop Coverstead, then run `npm run backup` from the release directory with its normal `ENV_FILE`. For Docker, follow `/install#backup`. The helper refuses to copy a database with a live writer. It copies the database, assets and configuration into a private timestamped folder under `BACKUP_DIR` (default `data/backups`). It does not include application source or dependencies: retain the matching release separately.

Restart the app after the backup and verify `/api/platform`. Copy the backup to a separate protected device or service. A copy on the same server does not protect against loss of that server. Monitor backup success and rehearse recovery. Managed off-server backup monitoring is not included in this release.

## Rehearse recovery in isolation

1. Select a backup and the source release that created it. Keep the backup unchanged. Install dependencies in a separate practice folder. Never point the rehearsal at a running venue's data paths.
2. Copy the backup's `coverstead.sqlite`, `assets` directory (if present), and `config.env` into the practice folder's `data` directory. Do not copy a `.lock` file.
3. Before starting, edit the copied configuration: set `PUBLIC_URL=http://localhost:3101`, `HOST=127.0.0.1`, `PORT=3101`, `COOKIE_SECURE=false`, `DB_PATH=data/coverstead.sqlite`, `ASSET_PATH=data/assets`, `BACKUP_DIR=data/backups`, `SMTP_HOST=` and `EMAIL_DNS_READY=false`. Retain the saved edition and use `DEMO_MODE=false`. Remove any inherited environment variables that override these rehearsal settings. This is essential when a server backup uses absolute paths.
4. From the practice folder, run `ENV_FILE=data/config.env node server.js`. Check owner login, the venue settings, recent bookings, customers and uploaded menus. Restored passwords are the ones stored in that backup.
5. Keep SMTP disabled throughout the rehearsal. An older backup may contain messages that were subsequently delivered; enabling its queue can resend them. The app does not automatically reconcile a restored queue with delivery history.
6. Stop the rehearsal. Keep any copied guest data and credentials protected and remove the practice copy when no longer required.

With Docker, use a separate project folder and volume. Before starting the app, copy the restored files into the stopped container's `/app/data`, make them writable by its `node` user, and apply the same rehearsal settings with `HOST=0.0.0.0`, `PORT=3100` and a separate loopback host port such as `127.0.0.1:3101:3100`. Do not reuse the production volume. Never use `docker compose down -v` on a live installation.

## Recover or update production

Schedule a short interruption. Stop only this venue's app, preserve its current data/configuration/uploads and source release, and take a consistent backup. Restore a chosen backup's database, uploads and configuration together, or install the new source while retaining the existing data paths. Keep email paused until the restored outbox has been checked against delivery history. Rebuild dependencies using the lockfile and the supported runtime.

Start one process and check HTTPS, owner sign-in, the diary, availability, menus and a controlled test booking. Confirm delivery separately when email is enabled. An application rollback may also require the matching pre-update database and assets if a future release changes schema; never assume older code can read newer data. Preserve reservations made since a backup before deciding to restore it.

## Access and troubleshooting

Use `npm run token` privately for initial owner setup. After an owner exists, the setup token cannot create another owner. To reset a password, stop the app and run `node scripts/reset-password.js` with its normal `ENV_FILE`, then restart. Sessions are held in memory and end on restart.

`/api/platform` is a public health/status endpoint. `/api/admin/*` requires authentication. Before publishing the booking link, complete the venue setup, email rehearsal and backup recovery rehearsal. A queued email is not a delivered email. Avoid including tokens, passwords or guest details in support logs.
