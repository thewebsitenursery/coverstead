# Coverstead 0.1.0 - implementation status

## Product and price

Coverstead: Full tables. Calmer service. Built from the locally recovered Red Lion reservation source. The free tool is positioned as Alistair Nichols giving something useful back to independent hospitality businesses.

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

This is a first pilot release, not an operational managed SaaS business. Stripe billing signup, Checkout, trial state, portal and subscription webhooks now work in test mode only; no real charges or automatic hosted venues result. Billing email verification/password recovery, live enrolment, multi-venue fleet control, automated provisioning, cross-installation service entitlement enforcement, managed off-server backup monitoring, uptime/crash/reboot monitoring, formal support operations and automatic upgrades are not connected. Each venue needs its own installation/database, hostname, mail settings and process. coverstead.net is the product/home installation; unrelated venues must not share its owner onboarding. See docs/STRIPE.md for the planner decisions, test boundary and launch requirements.

The original DNA Payments adapter is retained as reference code but online payments are disabled and unverified. No SMS, automated refunds, automatic release of unpaid bookings, waitlist, automatic guest edits/cancellations, Google Reserve/POS integration, separate kitchen limits per service, multiple active seasonal event types or automatic data-retention deletion is implemented. Table accessibility is an operational note, not an automatic allocation constraint.

The engine stores one SQLite snapshot in a single Node process. A process lock rejects a second writer. Do not run clustered workers, multiple containers or separate machines against one data file. For a future high-scale shared SaaS architecture, migrate persistence and tenancy deliberately rather than adding shared-database workers.

## Original source and live system

The source was recovered from the local October 2026 Red Lion project, with updates documented through 8 November. No live credentials, original database, customer records, menus or logos were copied. The original source and live server were not changed. Exact parity with newer live-server changes cannot be asserted until the Opalstack source is inspected.

Historic upstream tests are retained under test/upstream for reference; they target the original fixed Red Lion business rules and password flow. The current release uses the tests under test/*.test.js. Do not describe the old suite as passing on the generalised app.

## Deployment and verification

The product website is available at <https://coverstead.net>. Each venue must run an isolated installation with its own private configuration, persistent data and HTTPS route. Deployment-specific hostnames, ports and backup locations are retained privately by the operator. The pilot has been exercised on Node 20; new installations should use a maintained Node LTS release.

43 tests cover the actual Express handlers and reservation/billing rules using in-process HTTP requests, including asynchronous Stripe handlers. JavaScript and launcher syntax checks pass. The body-parser dependency was patched to 1.20.9 after an npm audit advisory; the subsequent audit reported zero known vulnerabilities. A local browser rehearsal completed the seven-step venue wizard, a guest booking and diary verification. A real Stripe sandbox Checkout completed a free monthly trial; Customer Portal access and cancellation at trial end were verified, including the corrected cancellation timestamp display. Public HTTPS smoke checks verified the deployed pages, protected APIs, private-file exclusion and rejection of unsigned webhooks. Actual Stripe test subscription-created, cancellation-update and subscription-deleted events were delivered to the public HTTPS webhook and updated the billing account without a manual refresh. The synthetic subscription was cancelled after verification. The Community source archive was scanned to confirm private configuration and Stripe secrets were excluded. A consistent server backup was taken before activating the tested release, and the dedicated stop/start scripts were exercised. SMTP delivery and Docker image startup remain unverified; backup recovery must still be rehearsed before real venue use.

## Public collaboration and discovery

Source and contributions: <https://github.com/thewebsitenursery/coverstead>. The repository includes contribution and security policies, bug/feature issue forms, a pull request template and CI on Node 22 and 24. Private credentials, venue data and operator deployment notes are excluded. The initial browser upload was integrated into the repository root without rewriting its history.

The homepage links to the repository, the public user manual at `/manual` and the customer/staff walkthrough at `/demo`. The full manual also serves authenticated staff help. The demo uses synthetic browser-local data, with no reservation or billing API calls; it is a walkthrough of the core flows rather than the complete installed app. Forty-seven automated tests pass, including checks that public demo/manual access leaves venue APIs protected. Browser checks exercised customer booking, staff status changes, reload persistence and responsive layouts.
