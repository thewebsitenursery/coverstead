# Coverstead 0.2.0-pilot.1 - implementation status

**Current position, 17 November 2026:** the hosted gateway, rehearsal venue, live Stripe catalog and encrypted off-server recovery have been verified as described in the latest section below. Production billing remains in test mode and paid enrolment is closed pending confirmation of the hosting provider’s processing arrangements. Earlier dated sections record the progress and limitations at those stages.

## Product and price

Coverstead: Full tables. Calmer service. Built from the locally recovered Red Lion reservation source. The free tool is positioned as Alistair giving something useful back to independent hospitality businesses.

Community is MIT-licensed and self hosted. Enterprise includes the first month free, followed by £10 per venue per month or £100 per venue per year paid upfront. The free month precedes either paid option. No setup fee, per-cover commission, or separate annual feature tier. Coverstead is operated by Classicbikemerch Ltd. The owner confirmed that the company is not VAT-registered; no VAT is added or collected in the test integration. Final service terms and live launch readiness remain to be completed.

The source is MIT-licensed, including the optional Enterprise administration modules. There is no DRM or proprietary licence activation. The commercial offer is the convenience of hosting, updates, backup operations and support. EDITION changes the interface and server-enforced feature availability on an installation; it is not proof of payment.

## Implemented

- Seven-step onboarding with server-saved drafts and optimistic revision checks.
- Venue identity, logo upload, public menu links/PDFs, opening hours and guest notes.
- Tables, areas, permitted combinations, total seating cap, table duration and reset buffer.
- Lunch/dinner schedules, booking horizon, notice, configurable arrival intervals.
- Rolling kitchen limits with original boundary behaviour; ordinary and staff bookings; walk-ins.
- Staff-confirmed large-party arrangements, with table conflicts and total capacity still enforced.
- Deposits recorded manually, pre-order tracking and one configurable seasonal event type.
- Daily/weekly/monthly/all-bookings diary, search, changes, statuses and cancellation.
- Session closures that preserve existing reservations and require acknowledgement of conflicts.
- Customer directory, completed visit history, CSV import preview/commit and consent records.
- Ten-visit loyalty eligibility; staff-issued, single-use money-off or percentage vouchers.
- Branded email outbox and SMTP delivery, gated by sender configuration; uploaded menu attachments.
- Printable A4 service sheets with private staff comments, independent of diary filters.
- Initial owner setup token, hashed passwords, secure-cookie option, session auth and origin checks.
- Enterprise additional staff accounts, owner/manager/staff permission checks, disable access, reports and activity log.
- Booking CSV export; consent-filtered marketing contact export.
- Idempotent guest booking retries; process lock; atomic database snapshots and rollback on persistence failure.
- Marketing landing page, pricing, founder story, download page and beginner installation guide.
- Public full user manual at /manual, GitHub contribution links, and a browser-only customer/staff walkthrough at /demo. Synthetic demo records stay in sessionStorage and never enter the venue database; it covers sample booking, diary filters, status/notes and printing, with simplified capacity rules.
- Docker Compose, HTTPS proxy example, backup helper, email setup, password reset and Opalstack deployment instructions.
- Rebuildable Community ZIP download with source allowlisting and private-data exclusion; operations/recovery documentation.
- Stripe test-mode subscription accounts, hosted Checkout, one calendar month trial, £10 monthly / £100 annual prices, Customer Portal and signed idempotent webhooks. Billing identities are separate from venue staff.
- Subscription state refresh, scheduled cancellation (including explicit cancel_at timestamps), duplicate checkout prevention and one trial per billing account. Live keys are rejected.

## Release boundaries

This is a first pilot release, not an operational managed SaaS business. Stripe billing signup, Checkout, trial state, portal and subscription webhooks now work in test mode only; no real charges or automatic hosted venues result. Live enrolment, multi-venue fleet control, automated provisioning, cross-installation service entitlement enforcement, managed off-server backup monitoring, uptime/crash/reboot monitoring, formal support operations and automatic upgrades are not connected. Each venue needs its own installation/database, hostname, mail settings and process. coverstead.net is the product/home installation; unrelated venues must not share its owner onboarding. See docs/STRIPE.md for the planner decisions, test boundary and launch requirements.

The original DNA Payments adapter is retained as reference code but online payments are disabled and unverified. No SMS, automated refunds, automatic release of unpaid bookings, waitlist, automatic guest edits/cancellations, Google Reserve/POS integration, separate kitchen limits per service, multiple active seasonal event types or automatic data-retention deletion is implemented. Table accessibility is an operational note, not an automatic allocation constraint.

The engine stores one SQLite snapshot in a single Node process. A process lock rejects a second writer. Do not run clustered workers, multiple containers or separate machines against one data file. For a future high-scale shared SaaS architecture, migrate persistence and tenancy deliberately rather than adding shared-database workers.

## Original source and live system

The source was recovered from the local October 2026 Red Lion project, with updates documented through 8 November. No live credentials, original database, customer records, menus or logos were copied. The original source and live server were not changed. Exact parity with newer live-server changes cannot be asserted until the Opalstack source is inspected.

Historic upstream tests are retained under test/upstream for reference; they target the original fixed Red Lion business rules and password flow. The current release uses the tests under test/*.test.js. Do not describe the old suite as passing on the generalised app.

## Deployment and verification

The product website is available at <https://coverstead.net>. Each venue must run an isolated installation with its own private configuration, persistent data and HTTPS route. Deployment-specific hostnames, ports and backup locations are retained privately by the operator. The pilot has been exercised on Node 20; new installations should use a maintained Node LTS release.

43 tests cover the actual Express handlers and reservation/billing rules using in-process HTTP requests, including asynchronous Stripe handlers. JavaScript and launcher syntax checks pass. The body-parser dependency was patched to 1.20.9 after an npm audit advisory; the subsequent audit reported zero known vulnerabilities. A local browser rehearsal completed the seven-step venue wizard, a guest booking and diary verification. A real Stripe sandbox Checkout completed a free monthly trial; Customer Portal access and cancellation at trial end were verified, including the corrected cancellation timestamp display. Public HTTPS smoke checks verified the deployed pages, protected APIs, private-file exclusion and rejection of unsigned webhooks. Actual Stripe test subscription-created, cancellation-update and subscription-deleted events were delivered to the public HTTPS webhook and updated the billing account without a manual refresh. The synthetic subscription was cancelled after verification. The Community source archive was scanned to confirm private configuration and Stripe secrets were excluded. A consistent server backup was taken before activating the tested release, and the dedicated stop/start scripts were exercised. Real venue SMTP delivery remains unverified; the later container rehearsal is described below. The automated isolated data/startup recovery rehearsal does not replace owner-login, mail-delivery or off-server recovery checks before real venue use.

## Public collaboration and discovery

Source and contributions: <https://github.com/thewebsitenursery/coverstead>. The repository includes contribution and security policies, bug/feature issue forms, a pull request template and CI on Node 20, 22 and 24. Private credentials, venue data and operator deployment notes are excluded. The initial browser upload was integrated into the repository root without rewriting its history.

The homepage links to the repository, the public user manual at `/manual` and the customer/staff walkthrough at `/demo`. The full manual also serves authenticated staff help. The demo uses synthetic browser-local data, with no reservation or billing API calls; it is a walkthrough of the core flows rather than the complete installed app. Forty-seven automated tests pass, including checks that public demo/manual access leaves venue APIs protected. Browser checks exercised customer booking, staff status changes, reload persistence and responsive layouts.

The in-process HTTP test harness uses a consistent socket buffer across Node versions; this avoids a Node 20 test-only stall while streaming the longer public manual. The Node 20 application tests passed after that correction.

## Discovery and readiness improvements

Public visitors now have separate demo, Community installation and planned managed-service paths. The managed overview at `/managed` describes availability honestly; public conversion links no longer direct people into team administration or test checkout. `/pub-booking-system` and `/switching-from-paper` provide a pub workflow overview and practical switching checklist. Canonical/social metadata, a product preview image, `/robots.txt` and `/sitemap.xml` support discovery; staff, booking, onboarding and test-billing pages return noindex headers. Indexing and traffic gains are not yet verified.

Optional aggregate public resource counts store only daily fixed-label totals, with no cookies or visitor identifiers; they default off on venue installations. See [WEBSITE-MEASUREMENT.md](WEBSITE-MEASUREMENT.md) for limitations. They cannot measure unique people, completed demos, active venues or revenue. A public venue-feedback issue form is available on GitHub; it is not managed enrolment or a private enquiry channel.

The isolated backup rehearsal helper checks integrity, copies assets, starts the app without a listening socket or service credentials, verifies protected routes and compares every original table row. Automated tests cover synthetic record recovery and credential isolation. Operator checks of real backups are recorded privately. Fifty-one automated tests cover the current implementation.

## Pilot readiness work, 17 November 2026

Private enquiries are open on the product website at `/enquire`, linked from the homepage and managed-service pages. Classicbikemerch Ltd uses hello@coverstead.net for enquiries and privacy requests, handled by Alistair. Submissions are saved privately, with persistent email alerts, retry limits and an operator CLI. The published notice covers the provider, consent, retention and recovery handling. No mailing list, hosted account or automatic visitor reply is created. See [ENQUIRIES.md](ENQUIRIES.md).

The SMTP sender has a real loopback SMTP rehearsal for acceptance, rejection, concurrent sends and withdrawn loyalty permission. Real-provider authentication, DNS and inbox delivery remain unverified; see [EMAIL-REHEARSAL.md](EMAIL-REHEARSAL.md). Legacy reservations without contact details no longer generate unmatched customer profiles on every restart; supported current booking paths still require a phone number. Existing reservations and profiles are retained.

A read-only readiness diagnostic checks configuration, integrity, owner/setup state, queued failures and recent local backups without printing private records. A bounded Coverstead release helper validates archives, runs tests, backs up and switches only its own installation, with source rollback on failure. It does not automate schema rollback. Protected off-server backup copies and their verification are recorded privately by the operator.

The enquiry-launch suite had 59 tests, including same-origin enquiry protection, private-inbox lifecycle, enquiry mail retries and transport failures, local SMTP dialogue and legacy CRM restart behavior. A controlled product-site email was accepted by the host’s sendmail transport. This does not establish real venue SMTP readiness or prove recipient inbox delivery.


## Guided venue pilots — 17 November 2026, second growth cycle

The homepage now leads directly to a guided three-step demo. A visitor must make their own sample booking, view the diary and seat that booking to complete it. Progress stays in tab storage; no completion analytics or guest details are sent. Completion offers a private enquiry or the new `/venue-fit` assessment, which surfaces unsupported card, SMS, POS and multi-location requirements honestly.

Enquiries can include optional, fixed-choice qualification context and self-reported source/demo experience. The private operator workflow adds qualified/rehearsal/waiting stages and due follow-up dates. These are workflow records, not payment or activation evidence. `/developers` and the developer pilot pack provide a practical route through rehearsal, isolated installation and handover.

A clean Docker build and synthetic two-installation rehearsal verified non-root execution, owner setup, booking retry deduplication, persistence after restart and data/session isolation. It does not establish public hosting, venue email receipt or disaster recovery. The optional helper removes only its own synthetic containers and volumes.

Billing email verification and password recovery are implemented for explicitly allowed test mailboxes. Single-use expiring links, hashed tokens, explicit password choice and session revocation are tested. Unverified accounts cannot log in, use Checkout or access Customer Portal. Live payment keys remain rejected; managed venue provisioning and customer enrolment remain closed. See [STRIPE.md](STRIPE.md).

The current suite has 65 passing tests. A versioned GitHub prerelease packages the source and pilot documentation. Marketing preparation and synthetic rehearsals are not evidence of new venues, paying customers or revenue.


## Assisted hosted-launch preparation — 17 November 2026

The code now supports a bounded host gateway with separate venue workers/databases/configuration, supervised worker restarts, private readiness records, hourly consistent worker snapshots and encrypted off-server backup/health helpers. Live-mode support is explicitly gated, uses a separate billing database, and refuses Checkout until an invited venue is recorded ready and the customer accepts service terms. Signed mode-matched events and hourly reconciliation update service access; staff can still handle/export existing bookings when new bookings are blocked. Tests exercise host/session isolation, crash/restart persistence, backup restoration, readiness/terms gates and subscription state.

This preparation does **not** mean managed enrolment is live. Live Stripe credentials and account settings, venue HTTPS routes, actual venue email receipt, off-server storage/restoration, alert delivery, retention and final company service/privacy documents remain unverified. Source helpers do not establish those external arrangements. See [MANAGED-HOSTING.md](MANAGED-HOSTING.md).


## Hosted infrastructure verified — 17 November 2026

The dedicated gateway is deployed with a conservative three-venue limit. A separate rehearsal hostname has a valid HTTPS certificate; owner authentication, settings, a synthetic booking, retry deduplication, diary access and product-session isolation passed. The owner confirmed receipt of both booking emails and the monitoring test in hello@coverstead.net. The monitor uses an explicit HTTP Host header for Node 20 compatibility; 72 tests passed on the host and CI.

Live Stripe credentials now authenticate a GB account for CLASSICBIKEMERCH LTD with charges and payouts enabled. Coverstead-only live monthly/annual prices, a dedicated portal and a live webhook are prepared. Trial-end, renewal, failed-card and expiring-card reminders are saved, with a Coverstead subscription-management link and payment-authentication emails. No customer has been charged and production billing remains in test mode.

An encrypted Restic repository is configured in a private Backblaze B2 EU Central bucket, with free-usage caps and alerts. Its first product and rehearsal snapshots were restored on the operator’s separate Mac and passed database/asset recovery checks. Hosted-launch terms, privacy and processing pages include the confirmed company identity. They remain marked as preparation documents: Opalstack’s processing agreement and its infrastructure backup/deletion arrangements have not been verified. The published provider terms describe 12-week infrastructure backup retention; the app’s shorter backup schedule must not be represented as covering those copies. A specific provider clarification request was sent to Opalstack support on 17 November 2026; no new terms or charges were accepted. Do not populate the global privacy launch evidence or open paid enrolment until the actual contractual arrangements are resolved.

A subsequent restore of the encrypted backup onto the operator’s separate Mac recovered the synthetic service booking, accepted the saved owner password and supported a new booking and diary entry with all outgoing mail and payments disabled. The public rehearsal also retained its owner authentication and booking after the release restart. Daily encrypted backup scheduling and health-change alerts are configured through Coverstead-only jobs; the repository’s storage limits and the on-host monitor’s limitations still require operator attention.
