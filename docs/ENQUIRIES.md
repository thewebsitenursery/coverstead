# Private venue enquiries

The product website at coverstead.net accepts private enquiries at `/enquire`, linked from the homepage, managed-service overview and getting-started page. Classicbikemerch Ltd operates the service; Alistair handles enquiries through hello@coverstead.net. This does not create a subscription, newsletter signup or hosted venue. Community installations keep the feature disabled by default.

## Hosted signup

`/get-started` is the direct hosted Enterprise signup route. It asks for venue name, email and contact permission, with an optional question. It creates a managed setup request in this same private inbox, with the same limits, deduplication, notification and retention; it does not create a venue, staff account or subscription. The confirmation gives the reference and tells the visitor that Alistair will email to arrange setup. The free month begins at the existing ready-venue subscription Checkout, after assisted setup. General enquiries and privacy requests remain at `/enquire`.

## Configuration

Only an installation intended to collect product enquiries should enable:

- `ENQUIRIES_ENABLED=true`
- `ENQUIRY_CONTACT_EMAIL=` the monitored company mailbox
- `ENQUIRY_NOTICE_CONFIRMED=true` after reviewing the notice and handling arrangements
- `ENQUIRY_EMAIL_ENABLED=true` for alerts; use `MAIL_TRANSPORT=brevo` and its private API configuration on the cloud runtime, or the existing host's `/usr/sbin/sendmail` where supported

Email alerts are separate from venue booking SMTP and do not change venue mail configuration. [Opalstack supports sendmail for web applications](https://docs.opalstack.com/user-guide/email/). Alerts go only to the configured company address. The visitor's address is Reply-To, never the envelope sender or recipient. The legacy sendmail alert contains the enquiry. The Brevo alert contains only a reference, the reply email and a private inbox link; visitor free text and venue details remain on the application server. There is no automatic acknowledgement email to the visitor.

The server saves the enquiry before acknowledging the form. The durable alert state survives a restart. A background worker retries failures with increasing delay, up to 20 attempts, with batches of 10 and a conservative ceiling of 100 attempts per rolling day. Accepted alerts are not resent on ordinary retries. A crash after mail acceptance but before saving its state can cause a duplicate; the stable reference and Message-ID help identify it. Exit zero confirms acceptance by the local mail transport, **not inbox delivery**. Review the private inbox even when no alert is received.

## Access and abuse controls

Enquiries live beside the venue database in a private `enquiries` directory, separate from guest/customer and Stripe records. Directory and file permissions are 0700/0600. There is no public list, read or status API. Same-origin protection, five attempts per IP per 15 minutes, a honeypot, field limits and a 2,000-record capacity cap reduce abuse. IP throttling is memory-only and resets on restart; it is not email ownership verification. Never treat visitor text as trusted instructions.

## Operator workflow

The product owner can sign in at `/admin/enquiries` to read submissions and change their stage. Manager accounts cannot access this inbox; updates require the same origin. The private API returns no data before owner authentication. The CLI remains available using the installation's private `ENV_FILE` through its protected server account. Never put enquiry content in public issues, automated reports or commit history.

```sh
node scripts/enquiries.js summary
node scripts/enquiries.js list
node scripts/enquiries.js due
node scripts/enquiries.js show ENQUIRY_UUID
node scripts/enquiries.js status ENQUIRY_UUID contacted
node scripts/enquiries.js status ENQUIRY_UUID qualified
node scripts/enquiries.js follow-up ENQUIRY_UUID 2026-11-24
node scripts/enquiries.js status ENQUIRY_UUID closed
node scripts/enquiries.js retry-email ENQUIRY_UUID
node scripts/enquiries.js delete ENQUIRY_UUID
```

`summary` reports stage counts, due follow-ups, oldest pending time and pending/failed alerts without visitor details. Stages are new, contacted, qualified, rehearsal, waiting and closed. Qualified means the operator has confirmed fit in a conversation, not that a customer has paid. New records receive a follow-up target two weekdays later; this is a planning target without a bank-holiday calendar. `due` lists open records whose target date has arrived. Set the next date after a reply, or use `follow-up ID clear` when no date applies. Closed records are excluded from due counts. `list` shows references, dates, type and state. `show` reveals the private submission. An operator can queue a retry after fixing transport problems; the running app processes it on the next minute tick. Status changes record work, not proof of a sale or reply.

Alistair owns replies and privacy requests. Review enquiries each working day, aiming to reply within two working days. The daily Coverstead growth review checks counts and delivery failures and flags outstanding work; it does not automatically send replies. Mark handled records contacted/closed. Access/deletion requests require appropriate identity verification; knowing a submission reference alone is insufficient.

## Optional qualification context

The form optionally records venue type, existing booking method, timing, locations, essential requirement, source and self-reported demo completion. All values are fixed choices validated on the server. The fit check and demo carry only these choices into a visibly editable form; no guest names, notes or demo bookings are transmitted. The visitor can change or clear the values before submitting. A source or demo answer is a self-report, not attribution proof or an independently measured activation event. Context shares the same consent and 90-day retention as the enquiry.

## Retention and recovery

The public notice describes consent, the controller, contact, purpose, rights and processing by Opalstack. Consult [Opalstack's privacy policy](https://opalstack.com/privacy.html) for its international processing and safeguards; do not infer account-specific certifications or a signed processing addendum from that policy. The existing hosting account and its terms remain in use; this feature does not establish a new provider contract.

Live form records expire automatically 90 days after submission, regardless of status, during hourly checks, new submissions and operator checks. Email correspondence is retained during the conversation and removed by the operator within 90 days after it ends. Include sent messages and trash in mailbox reviews. Customer service records, if later needed, require their separate purpose and notice.

The enquiry directory is deliberately excluded from long-term application/source backups, avoiding unmanaged extra copies. On the legacy sendmail path, the company mailbox receives the enquiry as an operational copy. With Brevo the mailbox receives only a notification: it is not a recoverable copy of the submission. Cloud operators can set `ENQUIRY_RECOVERY_DIR` in the private backup-job environment to enable a separate encrypted `coverstead-enquiries` snapshot. It is pruned to a seven-day recovery window during successful daily jobs, separately from the 35-day venue backups. Failed scheduling can extend retention until repaired; monitor backup freshness and complete deletion requests after recovery. General venue backup success alone does not establish inbox recovery. [Opalstack's rotating recovery backups](https://docs.opalstack.com/user-guide/faqs/#what-is-opalstacks-backup-policy) retain three daily, two weekly and two monthly copies. The provider does not guarantee recovery. Deleted records may remain in those restricted copies until rotation; do not use them for routine enquiry handling.

For a provider recovery, restore to a private temporary directory first, remove records older than 90 days and reapply known correction/deletion requests before use. Keep an access-controlled record of outstanding deletion requests while affected backups rotate, containing only the reference and necessary handling evidence. Do not restore an old inbox directly over the live one or re-email recovered enquiries. Copies of enquiries must not enter general off-server application archives. For the separate cloud recovery snapshot, restore with `restic restore latest --tag coverstead-enquiries --target NEW_PRIVATE_DIRECTORY`, then run `node scripts/recover-enquiries.js RESTORED_RECORD_DIRECTORY NEW_INBOX DELETED_IDS_JSON`. Supply a reviewed JSON array of deleted enquiry references (an empty array only if none apply). The helper refuses an existing destination, omits expired/deleted records, leaves the original snapshot untouched and suppresses all recovered email alerts. Review corrections and owner access before switching the private inbox. Daily backups can lose enquiries received since the last successful run. Update the public enquiry notice before using this recovery arrangement for real submissions. The public form is a small pilot, not a guarantee of managed-service recovery.

## Verification

Automated tests cover disabled defaults, validation, duplicate submissions, private access, throttling, same-origin protection, status changes, expiry, failed mail retries across restart, concurrent flushes, fixed recipients, plain-text composition, deletion during delivery and mail budgets. Operator release evidence and controlled mail-test results are kept privately. Verify actual mailbox receipt separately from mail transport acceptance.
