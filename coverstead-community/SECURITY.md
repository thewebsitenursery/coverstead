# Security policy

Coverstead 0.1.x is a pilot. Security fixes are developed on `main`; older snapshots do not have a separate maintenance commitment.

## Report a vulnerability privately

Use [GitHub's private vulnerability reporting](https://github.com/thewebsitenursery/coverstead/security/advisories/new) from this repository's Security tab. Do not publish exploit details or affected guest information in a public issue or pull request.

Include the affected version, the impact, and minimal reproduction steps using synthetic data. Never attach real guest records, payment details, credentials or a live database. Test against an installation you control, with permission; do not probe the product website or other venues.

If the private reporting form is unavailable, open a public issue asking the maintainer for a private reporting channel, without disclosing the vulnerability itself.

## Operating an installation

Keep configuration and backups private, use HTTPS and secure cookies, finish owner onboarding, update dependencies, and rehearse backup recovery. Review [operations](docs/OPERATIONS.md) and [product limitations](docs/PRODUCT-STATUS.md) before accepting real bookings. Stripe support currently rejects live keys.
