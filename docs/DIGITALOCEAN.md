# DigitalOcean migration: staged deployment

Status: preparation only. The current website stays on its existing host until the new server has passed the checks below. Account registration, VM provisioning, public HTTPS, email delivery, off-server recovery and the final switch are separate steps. Preparing these files does not establish any of them.

## Initial server

Use a dedicated Coverstead project and one Basic Regular CPU Droplet in London (`lon1`), with 2 vCPUs, 4 GiB RAM and 80 GiB SSD. The published base price checked on 17 November 2026 is $24/month before tax, transfer overages or optional services. Keep the existing three-venue pilot limit until measured load tests justify a change. This server size is not a capacity promise for thousands of venues.

Use Ubuntu 24.04 LTS, SSH-key authentication and a dedicated operator key. Keep account recovery and two-factor authentication under the company owner's control. Set billing alerts. Provision no additional paid services implicitly.

Install Docker Engine and the Compose plugin from Docker's official Ubuntu repository on the **new VM only**. Use a DigitalOcean Cloud Firewall: initially SSH from the operator's current address; add public TCP 80/443 when HTTPS rehearsal is ready. Do not expose port 3100, a Docker API, databases or worker sockets. Docker-published ports can bypass UFW, so UFW alone is not the boundary. Install host security updates and arrange a controlled reboot check.

References: [Droplet pricing](https://www.digitalocean.com/pricing/droplets), [Docker on Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [Cloud Firewalls](https://docs.digitalocean.com/products/networking/firewalls/how-to/configure-rules/), [Node LTS](https://nodejs.org/en/about/previous-releases).

## Isolated staging package

`Dockerfile.managed` runs the existing managed gateway on Node 24 LTS, with Restic available for later backup configuration and a matching Community source archive built into the image. `compose.managed.yaml` starts the app as a non-root user with a read-only root filesystem, a dedicated writable data directory, bounded logs, a memory limit and an HTTP health check. Venue workers continue to have separate databases and private Unix sockets. There must be only one writer for each database.

The staging generator creates **fresh synthetic configuration**, refuses to overwrite an existing directory, uses distinct preview hostnames and disables Stripe, deposits, outgoing email, enquiries and metrics. It does not load any saved live credentials or create readiness evidence. Keep its setup tokens private.

Example commands on a fresh VM, from the reviewed source checkout:

```sh
docker build -f Dockerfile.managed -t coverstead-managed:REVIEWED_RELEASE .
sudo install -d -m 0700 /srv/coverstead/staging
# The parent is writable only by root; run the one-time generator as root.
docker run --rm --user 0 --network none \
  --mount type=bind,src=/srv/coverstead/staging,dst=/stage \
  coverstead-managed:REVIEWED_RELEASE node scripts/cloud-stage.js /stage/data
sudo chown -R 1000:1000 /srv/coverstead/staging/data
export COVERSTEAD_DATA_DIR=/srv/coverstead/staging/data
export COVERSTEAD_IMAGE=coverstead-managed:REVIEWED_RELEASE
docker compose -p coverstead-staging -f compose.managed.yaml up -d --no-build coverstead
curl -f -H 'Host: preview.coverstead.net' http://127.0.0.1:3100/api/platform
```

Use an immutable release tag and record the image ID/digest; never overwrite the tag of an active release. The parent directory is operator-private. Container UID 1000 owns only its data, not the application image or Docker daemon. Do not grant the application access to the Docker socket.

The initial app port is published only on loopback, so an SSH tunnel and explicit Host-header requests can test it before any DNS changes. Secure cookies are enabled for the later HTTPS rehearsal; do not weaken them for a public HTTP test.

After local checks pass, verify that `preview.coverstead.net` and `cloud-rehearsal.coverstead.net` are unused, and add **only those new A records** at the current DNS provider. Keep the apex, `www`, existing rehearsal hostname, nameservers and mail records unchanged. Copy `Caddyfile.managed.example` into an operator-managed configuration file and set `COVERSTEAD_CADDYFILE` to its absolute path. Start the `https` profile to obtain certificates and expose those two synthetic sites. The example adds noindex headers; this does not make the sites private, so never put real customer data in this preview.

```sh
docker compose -p coverstead-staging -f compose.managed.yaml --profile https up -d --no-build
```

## Email and mailbox

Keep the existing mailbox and MX records during this stage. The owner continues using the existing webmail inbox. Moving the website does not require a mailbox move. To leave the old provider completely, migrate the mailbox and its history as a later, separately verified step and update the sub-processor record accordingly.

DigitalOcean blocks SMTP ports 25, 465 and 587 by default. The existing host's local sendmail is not portable. Before enabling mail on the new server, select and configure a transactional provider using an HTTPS API, verify sender DNS and inbox receipt, and adapt **all four** delivery paths: venue booking mail, billing identity mail, enquiry notifications and monitoring alerts. Preserve retry, deduplication and recipient controls. Do not copy an enabled sendmail configuration into the new runtime. SPF/DKIM/DMARC changes must preserve existing mailbox sending while adding the new sender; do not create a second SPF record.

See [DigitalOcean's email guidance](https://docs.digitalocean.com/support/why-is-smtp-blocked/). No email provider account, fee or delivery claim is created by this deployment package.

## Rehearsal checks before cutover

- Record the installed image, dependency versions, VM identity, firewall rules and disk/memory headroom privately.
- Verify valid HTTPS on both staging hosts, unknown-host rejection, owner setup/login, customer booking, retry deduplication, diary updates, exports and cross-venue/session isolation.
- Restart the container, then reboot the VM. Check saved owners/bookings, container recovery and health. Docker marks unhealthy containers but does not restart a hung process just because it is unhealthy; configure and test a bounded external supervisor/alert procedure as well as the existing crash restart behavior.
- Test each mail path with synthetic records and confirm inbox receipt. Verify enquiries cannot disclose a private inbox and no recovered queue is replayed.
- Keep Stripe test mode for the rehearsal. Use the £25 monthly/£250 annual test prices, one calendar month free, signed webhooks and Customer Portal. Do not direct the existing webhook to staging or enable live billing as part of the hosting switch.
- Install scoped backup and monitoring schedules adapted to Docker. The Opalstack wrappers use host-specific Node activation, paths and sendmail and must not be copied unchanged. Test their concurrency/maintenance locks, failures and notifications. Add an external check that can report a complete VM outage.
- Initialise a separate staging Restic repository/prefix with appropriately restricted credentials, or use disposable synthetic storage for rehearsal. Do not give staging prune access to the current production repository. Before cutover, verify the production backup policy and provider lifecycle, and restore a consistent snapshot on a different machine. Preserve the existing repository and key until the replacement is proven.
- Review DigitalOcean, email and backup processing agreements, sub-processors, transfer safeguards and deletion arrangements. Our configured backup expiry does not establish the retention of provider-held copies. Update public terms and privacy notices to match the actual arrangement before accepting customers. Keep live readiness gates closed until supported by real evidence.

`node scripts/rehearse-managed-container.js IMAGE` exercises the actual Compose configuration locally with uniquely named synthetic containers/volumes. It verifies host isolation, owner setup, a booking, deduplication, login/data after restart, read-only/non-root execution, health and worker snapshots. It removes only its own rehearsal resources. It does not prove the cloud, DNS, email, offsite recovery or Stripe integration.

The normal application test suite can also be run inside the image with `ENV_FILE=/dev/null`. Its synthetic sendmail test writes an executable in the source checkout (some hosts mount `/tmp` noexec), so a disposable root test container is required for that fixture in this root-owned image. This is separate from the non-root application runtime rehearsal; it is not a reason to run the deployed app as root.

## Cutover and recovery

1. Save all current DNS records, the complete private application/configuration inventory and the exact current release. Identify product enquiries, billing/identity records, counts, venue databases/assets, launch/invitation/entitlement records and pending jobs. Worker backup snapshots deliberately exclude private enquiries; they are not a complete migration export.
2. Rehearse restoring copies to a separate private runtime with all mail/payment jobs disabled. Validate row counts and asset hashes without printing personal data. Remap absolute paths, preserve credentials securely and never import process locks, Unix sockets, stale readiness evidence or monitor success markers as proof of new-host health.
3. Lower only the necessary website DNS TTLs ahead of the switch and wait out the previous TTL. Preserve mail records and authoritative nameservers. Changing nameservers is unnecessary for the website move.
4. Schedule a short write pause, drain requests and stop **only Coverstead's** writers and scheduled jobs. Take a final consistent export including enquiries and current operator state. Restore it on the new host and verify it before allowing new writes. Never run two independent writable copies of a venue during propagation.
5. Change the relevant website records (including any existing AAAA records). During propagation, arrange a controlled proxy from the old Coverstead endpoint to the new writer, or keep the old endpoint in maintenance mode. Do not let it accept divergent bookings. Keep webhook event retries/idempotency and Stripe reconciliation in the switch plan.
6. Verify public DNS/HTTPS, bookings, staff access, enquiry persistence, mail delivery, Stripe test events, alerts and offsite backup. Keep the old source/configuration and final export for a documented recovery period. Remove or isolate old data only under the agreed retention plan.
7. Before enabling new writes, a failed migration can return to the old writer. After the new host accepts writes, a rollback first needs a write pause and a verified reverse data transfer compatible with the old release. Simply pointing DNS back risks losing bookings. A source rollback does not roll back the database.

The existing Red Lion application and other applications are outside this migration's scope. No broad server restart, account-wide cron replacement or shared hosting teardown is part of this procedure.
