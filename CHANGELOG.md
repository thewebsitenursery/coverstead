# Changelog

## 0.2.0-pilot.1 — 17 November 2026

A versioned pilot for independent venues and their developers. This is early software, with managed enrolment closed and Stripe in test mode only.

- Guide visitors through a sample booking, staff diary and seated status, then offer a private next step.
- Add a venue-fit assessment that calls out unsupported requirements before a switch.
- Add optional enquiry qualification and source answers, plus private follow-up stages and due dates.
- Add test billing email verification and password recovery. Checkout/Portal now require verified email, including for existing test accounts. New registration returns an email-link acknowledgement instead of creating a session. Configure the restricted test transport before using this flow; see `docs/STRIPE.md`.
- Add a developer pilot pack and an isolated two-container installation/restart rehearsal.
- Preserve the free MIT Community source and intended managed pricing: one free month, then £10/month or £100/year per venue.

Before updating an installation, stop its process and back up data/configuration/assets with matching source. This release adds billing identity tables and an email-verification column. Keep test-mail delivery disabled during recovery; do not replay old links or outboxes. Existing guest bookings and staff accounts use their original paths. Follow `docs/OPERATIONS.md` for rollout and rollback.

## 0.1.0 — initial pilot, 16–17 November 2026

Generalised reservation app, customer/staff demo, full manual, Community packaging, contribution/CI workflow and test-only Stripe subscriptions. Private company enquiries subsequently opened with bounded email alerts. No prior tagged GitHub release was published.
