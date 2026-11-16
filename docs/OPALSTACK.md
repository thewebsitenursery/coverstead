# Opalstack deployment template

Create a dedicated application, port and HTTPS route for each Coverstead venue. Use the values assigned in your hosting account. Never reuse another application's configuration, data, PID file or port.

## Layout

The launchers default to `$HOME/apps/coverstead`. Set `COVERSTEAD_APP_DIR` to another absolute application directory when needed. This is a template, not access information for the product website.

```text
<application-directory>/
  start, stop                  dedicated launchers
  original-<timestamp>/        preserved starter and original launchers
  releases/<release>/          source plus installed dependencies
  current -> releases/<release>
  data/config.env              private persistent configuration
  data/coverstead.sqlite       private persistent database
  data/assets/                 uploaded venue files
  data/backups/                consistent snapshots; also copy off-server
  logs/                        app-only stdout/stderr
  tmp/node.pid                 PID of this app's Node process
```

The supplied `scripts/opalstack-start.sh` and `scripts/opalstack-stop.sh` are installed as executable `start` and `stop` in the application directory. Both must use the same `COVERSTEAD_APP_DIR`. The stop script checks the executable, server script and working directory before signalling the PID; it refuses to signal a process outside this app's releases.

## Runtime and configuration

The start template activates the provider's `nodejs20` environment with `scl_source`, as used in the pilot. Check the runtimes currently supported by your host and use a maintained Node LTS release; update the activation line accordingly. The system Node may be too old. Activate the runtime before installing dependencies with `npm ci --omit=dev --ignore-scripts`.

Preserve the original starter and launchers before replacing them. Prepare a fresh release, then run `scripts/setup.js` with your own `--url`, assigned `--port`, and an absolute `--output` pointing to the persistent `data/config.env`.

Set absolute persistent paths for `DB_PATH`, `ASSET_PATH` and `BACKUP_DIR` in that configuration. Use `HOST=127.0.0.1`, `COOKIE_SECURE=true`, `DEMO_MODE=false`, `EMAIL_DNS_READY=false` and `ONLINE_DEPOSITS_ENABLED=false`. Keep the generated setup token private.

Select the intended release using `current`, then run the dedicated start script. Verify `/api/platform` both on the assigned loopback port and through your public HTTPS domain. Retrieve the owner token with `npm run token`, using `ENV_FILE` set to the persistent configuration path, and complete `/onboarding` on your own venue domain.

## Updates and recovery

Prepare and test a fresh release before stopping the service. Stop only this app with its dedicated launcher, take a consistent backup, select the new release and start it. Verify HTTPS, authentication, guest booking availability and the source download if you host the product pages. Retain the previous release and matching backup; read [OPERATIONS.md](OPERATIONS.md) before restoring data or re-enabling email.

The templates do not install crash recovery or reboot startup. Configure monitoring for this application separately. An unrelated venue must use its own installation; the product website is not a shared venue database.
