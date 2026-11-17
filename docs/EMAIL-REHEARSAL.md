# Email verification before a real venue service

The application outbox uses the SMTP sender in `mail-delivery.js`. A successful send means the SMTP server accepted a recipient. It does not prove inbox delivery. Production transport requires STARTTLS, or implicit TLS on port 465; no insecure transport option was added.

The automated test starts a loopback-only SMTP receiver, sends synthetic messages through Nodemailer, checks acceptance/rejection persistence, prevents concurrent duplicate sending, and excludes loyalty mail after permission has been withdrawn. Nothing is relayed to real addresses. This proves local protocol and queue behaviour only. It does not exercise authentication to a real provider, DNS, provider delivery rules or spam placement.

Before opening a real venue:

1. Configure an authorized mail service and verified sender. Keep `EMAIL_DNS_READY=false` until the sender/DNS requirements are satisfied.
2. Use an isolated synthetic installation with a recipient you control and have authorized for testing. Keep billing disabled and avoid importing real guest records.
3. Send a controlled booking confirmation. Check receipt, sender identity, reply-to, venue details and any menu attachment on the receiving mailbox.
4. Rehearse an amendment and cancellation. Inspect the protected email queue for failures; a retry must not revive withdrawn marketing permission.
5. Record the date, provider and outcome privately, without credentials. Enable venue email only after the rehearsal succeeds.

See [Nodemailer SMTP transport](https://nodemailer.com/smtp) for supported transport options. The local SMTP test deliberately disables TLS only on its isolated receiver; production settings retain TLS enforcement.

Hosted deployments may select `MAIL_TRANSPORT=sendmail` with an explicit authorised `SMTP_FROM` and `EMAIL_DNS_READY=true`. This uses `/usr/sbin/sendmail` through Nodemailer; the venue email remains Reply-To. SMTP stays the default. Test successful and failed child exits are covered by the mail rehearsal, but acceptance by the server is not proof of inbox delivery. Verify the hosted sender's DNS and a real booking email before recording venue readiness.
