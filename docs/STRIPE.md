# Coverstead Stripe subscriptions

**Hosted MVP status,18November2026:** live Stripe billing is enabled on the DigitalOcean product installation for operator-invited, ready venues. The live £25/£250 catalog, account charging/payout capability, portal and webhook are verified. Public identity/billing protections pass; no real subscription or charge was created for testing. The separate preview remains test mode. Each real venue must pass its own readiness and agree before subscription Checkout. The first cohort is limited to three venues.

## Business and planner decisions

Coverstead is operated by Classicbikemerch Ltd. The owner confirmed on 16 November 2026 that the company is not VAT-registered. This integration adds no VAT and leaves automatic tax disabled. Review obligations with the company's accountant before changing countries served or tax settings; no tax registrations or account-wide tax settings were changed.

Stripe is for Coverstead managed-service subscriptions, not venue guest deposits. The offer is one free calendar month, then £25 per venue per month or £250 per venue per year, paid upfront after the trial. The two intervals have the same Enterprise features. Community source remains free and MIT-licensed.

Stripe's implementation planner selected hosted Checkout, flat-rate subscriptions, payment details collected for the trial, Customer Portal, and Stripe's standard recovery tooling.

Implementation uses Stripe Node SDK 23.1.0 and API `2026-10-28.endive`, verified from the installed SDK. Flexible billing mode is explicit. Hosted Checkout's supported `subscription_data.trial_end` is used: Stripe's newer trial offers require private-preview access for Checkout. The date is one calendar month after checkout preparation, clamped to the next month's last day; the checkout expires after one hour. Trial eligibility is consumed when a subscription is verified. A cancelled account cannot obtain a second free trial by restarting.

## What is implemented

- `/billing`: mode-labelled signup/sign-in, monthly/annual selection, subscription status, refresh and portal access; live signup is limited to invited venues.
- Separate billing accounts and hashed sessions; venue staff identities and data remain separate.
- Server-owned price selection, customer mapping and redirect URLs. Browser-supplied amounts, price IDs and customer IDs are ignored.
- Per-account checkout serialization, persisted attempts, Stripe idempotency keys, and reuse/expiry of open Checkout Sessions.
- `/api/stripe/webhook`: raw-body signature verification before JSON parsing, test-mode enforcement, durable event deduplication, and current subscription retrieval to tolerate out-of-order delivery. Events for unrelated customers/products are ignored.
- Trial, active, past-due, unpaid, paused and cancelled state stored locally. Failed processing returns a retryable status instead of acknowledging unprocessed events.
- A dedicated Coverstead Customer Portal configuration permits payment-method updates, invoice access and cancellation at the period end. It does not modify the Stripe account's default portal configuration. Interval changes are not enabled in this pilot.
- Live keys require the explicit live-mode configuration below. Test Checkout never creates a hosted venue, activates Enterprise on another installation or changes guest reservations.

## Private setup

Store keys in a service-owner-only configuration file (mode 600) outside `public/`, normally `data/config.env` on the server. The local test configuration is `data/stripe-test.env`, excluded from source packaging. Do not copy that file into a release or commit it. Stripe-hosted redirect Checkout does not require Stripe.js or a browser publishable key; the supplied publishable key is retained privately for future client integrations.

```text
STRIPE_BILLING_ENABLED=true
STRIPE_SECRET_KEY=<private test restricted or secret key>
STRIPE_WEBHOOK_SECRET=<private endpoint signing secret>
STRIPE_PRICE_MONTHLY=<test monthly price ID>
STRIPE_PRICE_ANNUAL=<test annual price ID>
STRIPE_PORTAL_CONFIGURATION=<dedicated test portal configuration ID>
```

Prefer a restricted key with the minimum permissions required for Customers, Prices (read), Checkout Sessions, Subscriptions (read), and Customer Portal Sessions. Catalog/portal/webhook setup needs separate administrative permissions and should not remain on the runtime key. Keep test and live keys separate. If a key has been shared outside its intended secret store, rotate it and configure its replacement privately.

To provision/reuse the tagged test catalog and dedicated portal, run:

```sh
ENV_FILE=data/stripe-test.env node scripts/stripe-setup.js --webhook-url=https://coverstead.net/api/stripe/webhook
```

This catalog helper is for the Coverstead product operator, not individual venue installations; its optional webhook registration is deliberately restricted to coverstead.net. Contributors should use their own Stripe sandbox and configure a local webhook listener separately.

The helper never changes the company/legal identity, bank details, tax settings, default portal configuration or unrelated products. It updates the private config with IDs and the new webhook signing secret without printing secrets. If a webhook already exists but the secret is missing, recover/rotate that secret through Stripe rather than creating another endpoint.

## Testing and deployment

`npm test` includes billing account isolation, origin checks, server price selection, concurrency, invalid signatures, live-event rejection, duplicate and reordered delivery, retryable API failures, cancellation and trial reuse checks. These use a fake Stripe transport and real signature verification, independently of any account keys. The HTTP harness marks requests complete so async middleware can reply correctly.

For an end-to-end rehearsal, use synthetic details in the test-only billing account, open hosted Checkout, verify the amount, interval and trial date, use a Stripe test payment method, return and refresh status. Verify portal access and cancellation. Confirm delivery to the public webhook separately in Stripe Workbench; passing mocked tests is not evidence of actual webhook delivery. Keep no real guest data in billing test fixtures.

Webhook events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`, `invoice.paid`, `.payment_failed`, and `.payment_action_required`. Local subscription status is refreshed from Stripe rather than trusting a return URL or event ordering. A synchronous status refresh also handles delayed webhook delivery.

If a network failure leaves a checkout attempt with an unknown result, retry the same plan within its saved expiry. After that window the app refuses a new attempt; an administrator must reconcile it with Stripe before clearing the attempt. This avoids silently creating duplicate subscriptions. Never clear a pending attempt without inspecting its Stripe request and Checkout Session.

## Remaining before live subscriptions

This is test billing, not a completed managed SaaS operation. Automatic venue provisioning, cross-installation service entitlement enforcement, off-server backup monitoring, uptime/restart monitoring and formal support operations remain unconnected. A new billing account does not get access to the home installation's owner onboarding. Each real venue still needs its own app/database/hostname and deliberate provisioning.

Before live enrolment: settle service/cancellation/privacy terms and the trial-to-service start policy, verify the legal business identity and public receipt/support details in Stripe, review VAT and customer jurisdictions, configure trial/renewal reminders and Revenue Recovery, extend and rehearse the restricted test identity flow for live use, and rehearse live-mode readiness separately. The application requires a completed private launch record and an explicitly separate live billing database; those global checks are complete for the hosted MVP, while venue-specific checks still gate each invitation. It does not assume that Stripe recovery email settings are enabled merely because the planner recommended them.

Official references: [Hosted subscriptions](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=checkout&ui=stripe-hosted&platform=web), [trial offers and Checkout limitations](https://docs.stripe.com/billing/subscriptions/trials), [Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal), [webhooks](https://docs.stripe.com/webhooks), [Stripe Tax setup](https://docs.stripe.com/tax/set-up).

## Verified on 16 November 2026

43 automated tests and JavaScript syntax checks passed on the Mac and/or the deployed Node 20 environment; all 43 passed on Opalstack. The npm audit reported zero known vulnerabilities. Browser testing completed a real Stripe sandbox monthly Checkout, displayed the trial ending on 16 December 2026, opened the dedicated Customer Portal and scheduled cancellation. The explicit `cancel_at` field was confirmed and its display fixed. A separate synthetic annual subscription rehearsal verified real subscription creation/update/deletion webhook delivery over https://coverstead.net, authenticated portal creation and state updates without calling the refresh route. That test subscription was cancelled. No live payments, legal/tax account settings or unrelated applications were changed.


## Verified billing identity and recovery — 17 November 2026

Registration now sends a verification link instead of signing an unverified address in. The link lets its recipient choose the password; any password supplied during registration is ignored. Both verification and reset require confirmation of the new password and revoke all existing billing sessions and outstanding identity links. The user signs in explicitly afterwards. Legacy test accounts also need verification; no existing account is silently marked verified. Checkout and Customer Portal enforce email verification server-side, including for an old session.

Links use 32 random bytes, are stored only as SHA-256 hashes, are purpose-bound and single-use. Verification expires after 60 minutes; recovery after 15. Tokens are in the URL fragment, removed from the visible URL on page load, and are submitted only when the user completes the form. Loading a link does not consume it. The page uses a no-referrer policy. Requests return generic acknowledgements and apply per-address cooldown/hourly limits, an overall daily mail-request ceiling, and the existing route/IP throttle. Expired tokens and request fingerprints are purged on startup and subsequent requests.

Configure the product-site **test** transport privately:

```text
BILLING_EMAIL_ENABLED=true
BILLING_EMAIL_FROM=<verified company sender>
BILLING_EMAIL_TEST_RECIPIENTS=<comma-separated controlled test mailboxes>
```

The original test transport uses `/usr/sbin/sendmail`; the hosted MVP uses the configured Scaleway HTTPS transport. Test mode creates accounts/sends identity messages only for configured test recipients, while live mode uses the managed venue invitation registry. It does not turn on venue booking SMTP. Without this configuration, new test-account signup/recovery is unavailable. Replies remain generic for other addresses. Live keys require the explicit live-mode configuration below. A link-delivery failure leaves the existing password unchanged; the user can request another link after the cooldown. Identity mail is sent asynchronously, without a durable plaintext-token outbox; a crash before handoff requires a new link. The operator should monitor generic transport errors without logging links or passwords.

Tests exercise verification before login/checkout, purpose separation, hash-only token storage, expiry, replay rejection, generic recovery, cooldown, password confirmation, old-password rejection, session revocation and cross-account isolation. Transport tests enforce the recipient allowlist and sendmail rejection handling. These tests use synthetic accounts and captured mail, not real recipients or Stripe payments.

Design reference: [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). Keep the preview recipient restriction. Actual hosted mail, published service terms, production recovery and monitoring are verified; each real venue’s recipient and service checks remain mandatory.


## Explicit live mode

Live mode defaults off on downloaded/self-hosted installations. See [MANAGED-HOSTING.md](MANAGED-HOSTING.md) for assisted enrolment, private launch evidence, invitation/readiness checks, separate billing data, terms acceptance, service access and reconciliation. `scripts/stripe-setup.js --live` requires a live key and checks account charges/payouts status. The hosted product now uses its prepared live catalog and a fresh owner-only billing database; old test data was retained separately. The former public test webhook is disabled, and the separate preview test endpoint remains enabled. Actual signed test events were rehearsed; the first genuine customer subscription will provide the first live subscription/payment delivery evidence. Never create a fake live customer or charge to claim that evidence.
