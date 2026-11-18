# DigitalOcean migration: staged deployment

Status: cloud rehearsal in progress, 18 November 2026. A dedicated London VM runs the synthetic preview with valid HTTPS; its unattended overnight encrypted backup completed successfully. The current website and mailbox remain on their existing host. This is not the production switch or a live billing launch. The checks below separate verified staging behavior from the work still needed before cutover.

## Verified cloud rehearsal

The dedicated Ubuntu 24.04 VM has Docker Engine and Compose from the official repository, host updates, SSH key authentication, an operator-address SSH firewall rule and public HTTPS. The application uses Node 24, UID 1000 and a read-only root filesystem. Port 3100 remains loopback-only. The two new rehearsal DNS records use a 300-second TTL. The apex, `www` and existing rehearsal-host A-record TTLs are also now 300 seconds, with their original destination preserved. Nameservers and root mailbox routing have not changed; the separate notification subdomain has authenticated sender records.

The current VM release passes 83 application tests. Trusted HTTPS requests verified owner setup/login, secure cookies, a synthetic booking, retry deduplication, staff notes, CSV export and product/venue session isolation. A complete VM reboot restored both containers automatically, and the saved owner login and booking still worked. A consistent venue snapshot was copied to the separate operator Mac: database/asset integrity, unchanged table rows, saved owner login, the original booking and a new booking in the restored staff diary passed. A later encrypted Backblaze restore onto the separate Mac also passed saved-owner login and a new booking/diary check. The daily offsite timer is installed, with credentials mounted only into the disposable backup job.

The deployed proxy restricts the preview to the operator's current public IP, except `/api/platform` for external health monitoring and `/api/stripe/webhook` for signed test events. The example Caddy file below does not include this extra access restriction. Update the operator address deliberately if it changes; do not remove the restriction merely to fix access. Keep synthetic data only. Controlled mail is restricted to the operator test mailbox; Stripe remains in test mode and synthetic enquiries use the private owner inbox. The initial generator still disables these paths by default.

CPU, memory and disk resource alerts are configured for the rehearsal VM. An external HTTPS check watches the product health endpoint, with outage and certificate-expiry notifications to the operator mailbox. This detects a whole-site outage but does not establish the health of every venue, backup or mail queue. A five-minute preview outage produced actual outage and recovery emails. A hung venue recovered under the bounded supervisor; the restart cooldown was verified. Backup failure and recovery alerts also reached the operator inbox. DigitalOcean provides [resource monitoring at no additional cost](https://docs.digitalocean.com/products/monitoring/details/pricing/) and [one Uptime check allowance](https://docs.digitalocean.com/products/uptime/details/pricing/); additional checks are chargeable.

All four mail paths reached the operator inbox. Actual signed Stripe test subscription and cancellation events reached the preview; monthly/annual checkout showed £0 initially due, and Customer Portal opened. No real payment occurred. A read-only copy of the current installation passed an isolated cloud migration rehearsal, preserving both databases and saved login while disabling mail, payments and network access. Remaining work includes the mail-delivery issue and company mailbox arrangement described below, final provider/privacy notices, owner access and the final write-paused cutover. Keep live readiness gates closed.

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

Keep the existing mailbox and MX records during this stage. The owner continues using the existing webmail inbox. Moving the website does not require a mailbox move. The old provider has now replied that it offers no formal DPA. Resolve that remaining processing arrangement before opening the hosted pilot; any mailbox replacement must preserve its history and be verified separately. Moving the website alone does not remove this dependency.

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

## HTTPS mail and cloud maintenance

The earlier Brevo rehearsal is retained here as transport documentation; active staging now uses Scaleway as described below. The managed package supports `MAIL_TRANSPORT=brevo` with a private `BREVO_API_KEY`, an authenticated `SMTP_FROM`, and the existing DNS-ready mail gate. The operator's sending subdomain is separate from the incoming mailbox. Booking replies go to the venue; billing and monitoring replies go to the support mailbox. Enquiry alerts contain only a reference, reply address and link to the product owner's authenticated `/admin/enquiries` inbox. Owner access and same-origin updates are enforced by the server. No visitor free-text message or venue name is sent in these alerts.

Booking email bodies exclude guest requirements/allergies and private staff notes. Those remain in the private diary. HTTPS mail uses menu links instead of attachments. Inspect any existing unsent outbox before migration: old queued bodies were composed by the previous release and must not be replayed through the new provider without review.

Brevo sends one recipient per request to its fixed HTTPS API, with a 20-second timeout and a stable idempotency key for queued messages. Its deduplication window is 15 minutes; this is not an indefinite exactly-once guarantee. Provider acceptance is not proof of inbox receipt. The free account permits 300 emails per day, shared by all venues and operational mail. Review delivery logs and capacity before adding venues; no paid upgrade is automatic.

Set all-sender delivery-log retention to one month, never store email previews, enable per-contact tracking consent and disable tracking for unknown contacts. The adapter explicitly sends `contactPixelTrackingConsent: false` for every recipient. These account settings are saved, but an actual received message still contains an open pixel. The detailed API reference says false anonymises engagement events; full pixel removal is Enterprise-only. Do not describe these settings as pixel-free or as disabling all tracking. A support request asks whether full pixel and click removal is available without an upgrade; live-email privacy arrangements remain unresolved. References: [send API](https://developers.brevo.com/reference/send-transac-email), [tracking controls](https://help.brevo.com/hc/en-us/articles/37113920427922-About-email-tracking-pixels-and-the-CNIL-recommendation-in-Brevo), [retention](https://help.brevo.com/hc/en-us/articles/4415743225746-Configure-a-custom-retention-period-for-your-transactional-logs-and-email-previews).

`scripts/cloud-maintenance.sh` is a root-owned dedicated-VM helper, not an application endpoint. It requires an operator-controlled Compose wrapper, image tag and operations directory. The monitor checks each configured worker over HTTP; a ready IPC flag alone is insufficient. It bounds restarts to once per 15 minutes and shares a maintenance lock with backup operations. After a restart it waits up to 30 seconds for worker HTTP recovery before reporting status. Allow at least 180 seconds for the systemd monitor service. Workers publish status and take a fresh consistent snapshot at startup instead of waiting for the minute timer. Backup failure raises a marker and does not cause healthy workers to restart. The disposable backup container alone receives Restic access and the encryption password; the web container does not receive those credentials. Daily backup and minute monitoring timers are installed on the dedicated VM. The staging failure/recovery rehearsal verified lock exclusion, a wrong-password failure, preserved success evidence, failure/recovery notifications and successful encrypted restore onto the separate Mac. Consistent worker backups include configured private launch/entitlement records; after recovery these must be reviewed and reconciled against Stripe rather than treated as new-host readiness. Enquiries remain outside general backups. An optional `ENQUIRY_RECOVERY_DIR` creates a separate encrypted seven-day recovery snapshot, tagged `coverstead-enquiries`; venue restores must explicitly select `--tag coverstead-managed`. The enquiry restore helper omits expired/deleted records and suppresses mail replay. See [ENQUIRIES.md](ENQUIRIES.md).


## Scaleway staging connection and remaining checks

The shared mail adapter also accepts `MAIL_TRANSPORT=scaleway`, `SCALEWAY_SECRET_KEY` and `SCALEWAY_PROJECT_ID`, with `SMTP_FROM` identifying the verified sender. It uses the fixed Paris HTTPS endpoint, sends one recipient per call, rejects redirects and validates provider acceptance. All four mail paths retain their recipient and private-content controls. The 82-test suite passed locally, in the cloud image and in CI. The dedicated project, Essential plan, authenticated domain and send-only key are configured. All four paths reached the operator inbox; SPF/DKIM/DMARC passed and inspected messages contained no tracking pixel or rewritten link. The restricted configuration has been backed up off-server. The public site still uses its existing transport.

Use a dedicated project and an application key with `TransactionalEmailEmailApiCreate` only, scoped to that project. Configure DNS through the operator account rather than granting the runtime DNS or IAM administration. The Essential plan is active. The documented default quota is 10,000 emails monthly; account-specific confirmation has been requested because the console did not display the ceiling. Keep the operator-recipient allowlist until this and customer delivery readiness are resolved; do not increase quotas or buy Scale automatically. The published rate is 300 included messages then €0.25 per 1,000 before tax. Record actual settings privately.

Scaleway's API does not document idempotent request retries. Stable Message-ID values aid diagnosis; a lost acceptance response can still produce a duplicate when the app retries. Its API payload limit is 2 MB; booking emails continue using menu links. Use the service for individual transactional messages, not bulk marketing campaigns. Review the provider's retention details in [PROVIDER-REVIEW.md](PROVIDER-REVIEW.md), and verify raw received content before claiming that tracking is absent.

Booking notifications now save their reply destination when queued: guests reply to the venue, and staff reply to the booking customer. Retries retain that saved destination. Legacy messages fall back to the venue address, omitting a Reply-To that equals the recipient. Automated monitoring alerts have no self-reply header. Verify both customer and staff copies when testing delivery; staff notification recipients naturally match the venue address even outside a rehearsal.

Six received synthetic messages were marked spam by the recipient server, with scores of 11.02–13.51. Both providers replied to the authorized diagnostic requests. Opalstack identified the matching recipient/Reply-To as a possible cause; a controlled pair then scored 11.78 with it and 6.78 without it, the latter without a spam flag. The final customer confirmation reached a separate controlled Inbox with no spam flag (score 3.52), passing authentication, correct replies to the venue and no tracking found. Scaleway's account ceiling remains unconfirmed. No filtering was weakened. The subsequent staff/monitor reply correction is deployed and its received headers are verified, but both copies remain spam-tagged (7.99 and 9.12); full synthetic headers were supplied to the existing case. The customer receipt check is complete; the staff/monitor diagnosis remains open. The owner has enabled Scaleway TOTP and its active state was verified; recovery codes remain under the owner’s control. See [PROVIDER-REVIEW.md](PROVIDER-REVIEW.md).

The website TTL preparation was verified at 21:54 UTC on 17 November; wait out the previous one-hour TTL before a later cutover. No production A destination, nameserver or root MX record was changed. The runtime remains staging and billing remains test-only.

References: [API](https://www.scaleway.com/en/developers/api/transactional-email), [permission sets](https://www.scaleway.com/en/docs/iam/policies-permissions/permission-sets/), [quotas](https://www.scaleway.com/en/docs/transactional-email/reference-content/tem-capabilities-and-limits/), [pricing](https://www.scaleway.com/en/pricing/managed-services/).


## Current release verification — 18 November 2026

The managed image now makes its public source readable by the non-root runtime even when an operator extracts the release under a private umask. This does not change private mounted-data permissions. Check the built image as its normal user before switching the Compose wrapper; a root-only test run does not detect unreadable source directories. Run uploaded deployment scripts as files, and disable stdin on diagnostic Compose exec commands so they cannot consume a piped shell script.

The deployed release passed 83 application tests and its normal-user JavaScript check; both workers passed HTTP health checks after deployment. Fresh consistent worker snapshots include the corrected mail configuration and all six synthetic bookings; the encrypted off-server job completed with repository/sample checks. The earlier separate-Mac restore remains the full recovery evidence. Public website records, mailbox routing and live Stripe gates are unchanged.

Read-only production checks on 18 November confirm that the product site still needs its first owner account; the preview owner is synthetic. Preserve the product site's unconfigured venue status: it is not a hospitality venue. Establish real owner access to its private enquiry inbox during the final transfer. Live Stripe account/catalog checks pass, but the existing test billing database must not be relabelled live. Prepare a fresh live product database and preserve the test database privately; carry over actual enquiries, counts and required operator records separately. The earlier host-specific pending live configuration is not a DigitalOcean deployment configuration. Provider decisions, final notices and current-host evidence must be complete before activating the live launch gate.
