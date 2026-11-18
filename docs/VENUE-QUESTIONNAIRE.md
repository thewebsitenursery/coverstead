# Coverstead venue onboarding questionnaire

Start with the essentials. Save the answers as a draft; ask the optional operational questions during handover. The labels below distinguish what the current app actually enforces from information needed for a later release or a managed service.

## Start with a short conversation

For an initial hosted enquiry, four answers are enough: your venue and website, how you keep bookings today, the one thing you want to improve, and any feature you cannot operate without. Do not ask an interested owner to complete the whole questionnaire before trying the demo.

During an agreed setup, work through the operational sections together. Alistair handles hosted server, email and backup configuration; the venue confirms its service rules, people and actual email receipts. Use made-up guest details for the rehearsal. Agree one real service and a person responsible for the diary before setting a handover date.

## 1. The venue and the person in charge

- What is your venue’s trading name and address?
- Who owns the setup, and what email should their owner account use?
- What telephone number and email should guests use for changes, cancellations and pre-orders?
- What is your existing website address?
- What time zone do you operate in? This release uses GBP.
- Is this a pub, restaurant, café, bistro, hotel dining room or another venue?
- Are you self hosting, or choosing the £25 monthly / £250 annual managed plan? Hosted setup is assisted; subscription invitation follows the venue’s readiness checks.
- Who should receive operational enquiries, billing and incident notices? Managed-service handover item.
- Do you need separate installations for more than one venue? This release uses one isolated process and database per venue; no shared multi-venue console yet.

## 2. Rooms, tables and safe seating

- Which rooms or areas accept dining bookings?
- What is the number, seat count and room for every table?
- Which tables are accessible? What should staff confirm with guests?
- Exactly which combinations can be joined, and how many usable seats does each combination have?
- What is the maximum number of guests seated at the same time? It can be lower than the total chair count.
- How long is a normal visit? How much reset time is needed after it?
- What is the largest party that may book online? Larger parties are arranged by staff.
- Are there outdoor, dog-friendly, quiet or adults-only areas? Current release records areas and notes but does not offer guest area selection or enforce these preferences.
- How many highchairs and accessible spaces are available? Where do prams, wheelchairs and assistance dogs fit? Record operational notes; equipment inventory is a future feature.
- Is a table held back for walk-ins? Current release has no dedicated walk-in quota; use a conservative seating limit and staff judgement.
- Are there layouts that change by day or season? Automatic alternative floor plans are a future feature.

## 3. Opening hours and dining services

- What hours is the venue open to the public?
- Which weekdays have lunch, dinner, or no food service?
- For each service: what time do bookings start, when is the last arrival, and when does service close for walk-ins?
- Do you take arrivals every 10, 15, 20 or 30 minutes?
- How far ahead may a guest book? How much notice is needed for ordinary bookings?
- Which dates or services must close for private hire, holidays, maintenance or events? Use the staff closure tool.
- What should staff do about existing bookings when a session is closed? The app keeps them and warns staff to contact guests; it never automatically cancels them.
- Do you need breakfast, multiple sittings or after-midnight services? Current release supports lunch and dinner within one calendar day; additional service types are future work.

## 4. Kitchen capacity

- How many guests can the kitchen comfortably receive in any rolling time window?
- How long should that window be? For example, 16 guests in any 30 minutes.
- Does your practical kitchen limit change by day, service, menu or staffing? This release has one venue-wide limit; service-specific limits are future work.
- Should staff be allowed to seat walk-ins above the kitchen limit after seeing a warning?
- Who can arrange an exceptional large party with the kitchen?
- What should staff tell a walk-in if food may be delayed?
- Do children, non-diners or baby seats count differently? This release counts every entered guest equally for seating and kitchen capacity.

## 5. Branding, menus and guest information

- What logo should appear? Supply PNG, JPEG or WebP, up to 5 MB.
- What brand colour and short welcome line should be used?
- Which current menus and pre-order forms should guests receive? Supply public links or PDF uploads up to 5 MB each.
- Which documents apply to normal bookings and which to the seasonal event?
- Who replaces outdated menus and checks the booking page after a change?
- What accessibility, parking, highchair, dog or dietary information should guests see?
- Where is your privacy notice? What is your cancellation and deposit policy?
- Who follows up special requirements? Requests are recorded, not automatically guaranteed; allergy information must still be discussed with staff.

## 6. Groups, deposits and seasonal occasions

- At what party size is a pre-order required?
- What regular group deposit is required per booking? Use zero if there is none.
- How many hours before arrival must pre-orders be received?
- Who may agree a shorter-notice exception with the kitchen?
- Will you offer a seasonal booking type, such as a festive menu or special supper?
- What is its name, date range and available weekdays?
- What is its deposit per guest? Which menu and pre-order form apply?
- What extra reminder should the service sheet show, such as decorating the table?
- Who records deposits paid by phone or in person? This release does not collect card details or process refunds.
- When should an unpaid booking be released? Pending bookings remain held until staff cancel them; there is no automatic expiry yet.
- Are there ticketed events, minimum spends, per-service deposits or multiple concurrent seasonal menus? These need a later extension.

## 7. Daily service and the team

- Who needs owner, manager or staff access? Individual additional accounts and roles are Enterprise features.
- Which device will the host stand use? Does the team have a working printer?
- Who changes a booking to arrived, completed, no-show or cancelled?
- Who verifies table arrangements for large groups?
- What private information should appear in staff comments? These comments stay out of customer emails.
- Who checks pre-orders, deposits, special requirements and seasonal reminders before each service?
- Does the team want day, week, month or all-bookings views?
- Who prints the service sheet, and which service should it cover?
- Who handles failed emails and checks the email queue?
- Who covers the diary if the internet or server is unavailable? Keep a current printed service sheet; offline synchronisation is not implemented.

## 8. Guests, consent and loyalty

- Do you have an existing customer list or paper record of completed visits?
- Which source should be imported, and who will check the CSV preview before confirming it?
- Can you show when and how people agreed to marketing emails? Do not infer permission from a reservation.
- Which contacts are seasonal-event guests without a recorded visit?
- Do you want staff to offer a thank-you after ten completed, previously unrewarded visits in the previous twelve months? That is the current fixed rule.
- Will rewards be money-off or percentage discounts, and what terms apply?
- Who may issue and redeem vouchers? Issuing is deliberate, not automatic; emailed rewards require recorded permission.
- What retention period do you intend to use? The app records the preference, but automatic deletion and a guest erasure workflow remain to be built.
- Who handles a guest’s data-access or correction request? Restrict access to exported CSVs.

## 9. Hosting, email and launch

- Who maintains the server, domain, certificate, passwords and backups?
- What booking address should guests use? It must match PUBLIC_URL exactly.
- Is HTTPS working? Is the database inaccessible from public URLs?
- Which verified SMTP sender will be used? What host, port, username and password does the email provider supply?
- Have sender-domain DNS records been checked with that provider?
- Who will test confirmations, updates, cancellations, replies and spam-folder delivery?
- Where will protected off-server backups be stored, and who will practise a restore?
- Has someone tested the last available table, a full kitchen window, a closure, a large group, a walk-in and cancellation?
- Who will add the booking link to the venue website and social profiles?
- Is a migration from the live Red Lion system required? Use a separate copy and a reviewed migration; do not point a new installation at its live database.

## Questions kept out of the simple first-run wizard

The wizard covers essential, supported settings in seven steps. Billing contacts, domain verification, backup ownership, service-specific limits, advanced floor plans, equipment counts, integrations and other future features belong in the managed-service handover or development backlog. Capturing an answer must never suggest that an unsupported rule is being enforced.
