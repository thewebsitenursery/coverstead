# Coverstead Stripe subscription pilot

## Business and planner decisions

Coverstead is operated by Classicbikemerch Ltd. The owner confirmed on 16 November 2026 that the company is not VAT-registered. This integration adds no VAT and leaves automatic tax disabled. Review obligations with the company's accountant before changing countries served or tax settings; no tax registrations or account-wide tax settings were changed.

Stripe is for Coverstead managed-service subscriptions, not venue guest deposits. The offer is one free calendar month, then £10 per venue per month or £100 per venue per year, paid upfront after the trial. The two intervals have the same Enterprise features. Community source remains free and MIT-licensed.

Stripe's implementation planner selected hosted Checkout, flat-rate subscriptions, payment details collected for the trial, Customer Portal, and Stripe's standard recovery tooling.

Implementation uses Stripe Node SDK 23.1.0 and API `2026-10-28.endive`, verified from the installed SDK. Flexible billing mode is explicit. Hosted Checkout's supported `subscription_data.trial_end` is used: Stripe's newer trial offers require private-preview access for Checkout. The date is one calendar month after checkout preparation, clamped to the next month's last day; the checkout expires after one hour. Trial eligibility is consumed when a subscription is verified. A cancelled account cannot obtain a second free trial by restarting.

## What is implemented

- `/billing`: clearly labelled test signup, sign-in, monthly/annual selection, subscription status, refresh and portal access.
- Separate billing accounts and hashed sessions; venue staff identities and data remain separate.
- Server-owned price selection, customer mapping and redirect URLs. Browser-supplied amounts, price IDs and customer IDs are ignored.
- Per-account checkout serialization, persisted attempts, Stripe idempotency keys, and reuse/expiry of open Checkout Sessions.
- `/api/stripe/webhook`: raw-body signature verification before JSON parsing, test-mode enforcement, durable event deduplication, and current subscription retrieval to tolerate out-of-order delivery. Events for unrelated customers/products are ignored.
- Trial, active, past-due, unpaid, paused and cancelled state stored locally. Failed processing returns a retryable status instead of acknowledging unprocessed events.
- A dedicated Coverstead Customer Portal configuration permits payment-method updates, invoice access and cancellation at the period end. It does not modify the Stripe account's default portal configuration. Interval changes are not enabled in this pilot.
- No live key is accepted. Test Checkout never creates a hosted venue, activates Enterprise on another installation or changes guest reservations.

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

This is test billing, not a completed managed SaaS operation. Email verification, billing password recovery, automatic venue provisioning, cross-installation service entitlement enforcement, off-server backup monitoring, uptime/restart monitoring and formal support operations remain unconnected. A new billing account does not get access to the home installation's owner onboarding. Each real venue still needs its own app/database/hostname and deliberate provisioning.

Before live enrolment: settle service/cancellation/privacy terms and the trial-to-service start policy, verify the legal business identity and public receipt/support details in Stripe, review VAT and customer jurisdictions, configure trial/renewal reminders and Revenue Recovery, implement verified billing identity and recovery, and rehearse live-mode readiness separately. The application deliberately rejects live keys until that work is complete. It does not assume that Stripe recovery email settings are enabled merely because the planner recommended them.

Official references: [Hosted subscriptions](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=checkout&ui=stripe-hosted&platform=web), [trial offers and Checkout limitations](https://docs.stripe.com/billing/subscriptions/trials), [Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal), [webhooks](https://docs.stripe.com/webhooks), [Stripe Tax setup](https://docs.stripe.com/tax/set-up).

## Verified on 16 November 2026

43 automated tests and JavaScript syntax checks passed on the Mac and/or the deployed Node 20 environment; all 43 passed on Opalstack. The npm audit reported zero known vulnerabilities. Browser testing completed a real Stripe sandbox monthly Checkout, displayed the trial ending on 16 December 2026, opened the dedicated Customer Portal and scheduled cancellation. The explicit `cancel_at` field was confirmed and its display fixed. A separate synthetic annual subscription rehearsal verified real subscription creation/update/deletion webhook delivery over https://coverstead.net, authenticated portal creation and state updates without calling the refresh route. That test subscription was cancelled. No live payments, legal/tax account settings or unrelated applications were changed.
