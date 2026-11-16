# Contribution priorities

Coverstead is a working pilot for one venue per installation. These are areas where feedback and contributions would help; they are not promised release dates.

## Useful first contributions

- Rehearse the installation guide on a clean machine and clarify confusing steps.
- Check keyboard navigation, labels, focus handling and mobile layouts in booking, onboarding and the staff diary.
- Improve error messages and empty states using realistic service scenarios.
- Add regression cases for table allocation, kitchen pacing and date boundaries.
- Report practical gaps from a synthetic service rehearsal: walk-ins, large parties, closures and printing.

## Reliability before broader use

- Repeatable Docker startup and isolated backup/restore rehearsals.
- SMTP delivery rehearsals and clearer mail failure visibility for staff.
- Operator monitoring for backups, uptime, process crashes and restarts.
- Explicit data retention and deletion workflows.

## Managed-service work

Stripe Checkout and Customer Portal are currently test-only. Live enrolment needs verified billing identity, password recovery, service terms, deliberate venue provisioning, entitlement handling and operational support. Discuss these changes first: they cross authentication, payments and venue isolation boundaries.

## Ideas to discuss

Waitlists, guest changes/cancellations, service-specific kitchen limits, multiple seasonal events and integrations with other hospitality systems are possible future work. Describe the venue problem and a small proposed first step in a feature request.

See [PRODUCT-STATUS.md](PRODUCT-STATUS.md) for what already exists and [CONTRIBUTING.md](../CONTRIBUTING.md) for the contribution process.
