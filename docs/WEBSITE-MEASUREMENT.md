# Public website measurement

Optional `WEBSITE_METRICS_ENABLED=true` enables aggregate request counts for a fixed list of public marketing resources. It defaults to false on venue installations. The count file lives beside `DB_PATH` as `website-counts.json`, outside the public directory, with private permissions. Run `node scripts/website-report.js` with the installation's normal `ENV_FILE` for the last seven UTC calendar dates.

Each saved record has a date, a fixed resource label and an integer count. No IP address, visitor ID, cookie, query string, referrer, user agent, guest or billing data is stored in this file. The middleware counts only successful GET responses, excluding known crawlers, prefetches and requests bearing `X-Coverstead-Check: 1`. Add that header to operator smoke checks. Browser QA can count; record its date and avoid treating QA traffic as demand. Anonymous counting does not prove all requests are human.

Counters flush every 15 seconds and on normal exit. A crash may lose the final interval. At most 90 UTC calendar dates are retained, including pruning on idle flushes. A corrupt file disables measurement without overwriting it or affecting venue requests. Keep one process per installation, as required by the venue database. There is no public statistics endpoint.

These are resource requests, **not** unique visitors, completed demos, installations, leads, active venues, customers or revenue. Do not divide page counts to claim a user conversion rate: they are not linked sessions. No cross-page source attribution is implemented. A demo view switch inside an already loaded page does not make another server request. Source downloads are not evidence of installations. Future customer adoption metrics require deliberately verified events and appropriate data handling.

The website explains this feature at `/website-data`. The host's separate access/security logs are outside this counter's scope. No analytics cookies or browser tracking scripts are added.

`/sitemap.xml` lists public discovery pages. `/robots.txt` points to it; billing, onboarding, booking and staff pages have an `X-Robots-Tag: noindex, nofollow` response header. Search discovery is not authentication: private APIs remain protected independently. Canonical and social metadata identify Coverstead's main product website. Search engine indexing and rankings are not guaranteed by a sitemap.
