# Run a useful Coverstead venue pilot

Start with one independent venue and a named operator. Coverstead Community is MIT-licensed; your hosting, email and support arrangements are separate. [Hosted Enterprise](https://coverstead.net/managed) is open for an assisted first cohort of three venues. We prepare and check each venue before subscription invitation. Do not promise a partner commission, service entitlement or automatic migration.

## Agree what success means

Ask which task causes the most friction and what would prevent a switch. Check required card payments, SMS, POS and multi-location workflows against the [current boundaries](PRODUCT-STATUS.md). In the public demo, ask the operator to make a fictional booking, find it in the diary and seat the guests without coaching. Record the assistance needed, not just whether the page opened.

Use the [venue-fit check](https://coverstead.net/venue-fit) and [private enquiry form](https://coverstead.net/enquire?source=developer&kind=community) for a discussion. Do not put contacts, real guest records or private operational details in public GitHub issues.

## Install an isolated practice copy

Download the [versioned pilot release](https://github.com/thewebsitenursery/coverstead/releases/tag/v0.2.0-pilot.1), verify its SHA-256 file, and extract it into a new folder. Follow the [installation guide](https://coverstead.net/install) for Docker or Node. Review the host's requirements and Docker's licence for your organisation.

For a new Docker practice project with no existing Coverstead data:

```sh
docker compose build
docker compose run --rm coverstead node scripts/setup.js --url=http://localhost:3100
docker compose up -d
```

Keep the setup token private and create the owner at `http://localhost:3100/onboarding`. Each venue needs its own project, volume, hostname and mail configuration. Never point two installations at the same SQLite snapshot. Do not use `down -v` on a venue's real data.

A repeatable synthetic container rehearsal is also available after building an image:

```sh
docker build -t coverstead-rehearsal .
node scripts/rehearse-container.js coverstead-rehearsal
```

The helper creates uniquely named containers and volumes, binds to loopback, checks owner setup, a booking retry, restart persistence and a second isolated installation, then removes only its own synthetic resources. It does not publish a venue or verify real email delivery.

## Five checks before real guest use

1. **Control:** the venue owner can sign in, keep the setup token private and explain who handles support. Use normal authentication, not demo bypass.
2. **Service rules:** rehearse a normal booking, a phone booking, a walk-in, a large party and a closure against the venue's actual tables and kitchen limits. Check the service sheet with the team.
3. **Delivery:** confirm the actual guest and staff email reaches controlled inboxes. A queued or SMTP-accepted email is not proof of receipt.
4. **Recovery:** stop the practice app, back it up, recover to a different folder/volume and verify owner sign-in and the diary. Agree off-server copies, retention and recovery responsibility.
5. **Handover:** provide the venue URL, private credential handover, privacy information, support contact and a fallback plan. Confirm the operator wants to proceed before importing any necessary guest data.

## Review the pilot, then decide

At the first real service, record whether the diary matched the team's operation and what failed. After four weeks, ask whether the venue still uses it and why. With consent, retain the minimum operational evidence needed for follow-up; keep contact details in the private enquiry workflow.

A managed-service conversation should cover the published price (£25/month or £250/year after the free first month), current missing features, support expectations and actual operating costs. Do not start the free month or take live payment until the hosted venue and service terms are ready. A demo completion, download or expression of interest is not a paying customer.
