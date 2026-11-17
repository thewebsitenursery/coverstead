# Private venue enquiry pilot

This feature is implemented for review and **disabled by default**, including on coverstead.net. It is not live enrolment, a mailing list or a hosted account. A verified company contact address and complete data-handling arrangements are still required before opening collection. The `/enquire` page remains unlinked and noindex; while disabled it displays no form.

## Activation prerequisites

Before enabling, confirm the company contact mailbox is monitored; finalise the controller/contact details, hosting location, any applicable international transfer arrangements, privacy notice and retention/backup policy; and assign responsibility for reviewing enquiries and replying. The prepared notice is a draft requiring that operational review. Read the ICO's [privacy information guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/). Do not set the confirmation flag merely to display a form.

Only the product installation should set all of:

- `ENQUIRIES_ENABLED=true`
- `ENQUIRY_CONTACT_EMAIL=` a verified, monitored company email
- `ENQUIRY_NOTICE_CONFIRMED=true` after the prerequisites above are satisfied

Then review `/enquire` with synthetic details and add a public call to action deliberately. The code does not automatically email anyone. It stores enquiries privately beside the venue database in an `enquiries` directory; it does not put them in guest/customer or Stripe records. The public API accepts submissions but provides no enquiry-list or record-reading route. Existing same-origin protection applies, with an additional five-attempt/15-minute in-memory IP throttle, honeypot, field limits and a 2,000-record capacity cap. A server restart resets the throttle. These controls reduce abuse; they do not verify email ownership or guarantee a spam-free inbox.

## Operator workflow

Run with the installation's normal `ENV_FILE`, through the existing protected server account. Never paste detailed records into public issues, automated reports or commit history.

```sh
node scripts/enquiries.js summary
node scripts/enquiries.js list
node scripts/enquiries.js show ENQUIRY_UUID
node scripts/enquiries.js status ENQUIRY_UUID contacted
node scripts/enquiries.js status ENQUIRY_UUID closed
node scripts/enquiries.js delete ENQUIRY_UUID
```

`summary` prints only counts and the oldest pending time. `list` prints references, dates, kind and state. `show` reveals the private submission and should be used only when handling it. Status commands record operator work; they do not send a reply or prove a sale. Read new enquiries daily once collection opens. Identity/access or deletion requests require appropriate verification; possession of a public enquiry reference alone is not proof of identity.

Repeated submissions with the same UUID and payload do not create duplicates; changing the payload under an existing UUID fails. No newsletter permission is inferred. Live records are removed 90 days after their original submission, regardless of status changes, during hourly retention runs, new submissions and operator summary/list checks. The inbox is separate from the current venue backup helper; decide its backup/retention handling before activation and disclose it accurately. Keep aggregate counts of verified qualified enquiries separately if needed, without retaining expired personal records.

Tests cover disabled defaults, field validation, retries, privacy, rate limits, origin protection, status changes and expiry. Browser rehearsal uses only synthetic local data. Public collection remains off until the operator has provided the missing information.
