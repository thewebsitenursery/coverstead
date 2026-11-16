# Contributing to Coverstead

Help us make service easier for independent hospitality teams. Practical venue feedback is as useful as a code change.

## Suggestions and bug reports

Search existing issues, then use the [bug report or feature request template](https://github.com/thewebsitenursery/coverstead/issues/new/choose). Describe the task you were trying to complete, what happened and what would help. Use synthetic guest details. Never include databases, configuration files, API keys, installation tokens or real booking records.

Security concerns belong in a private report; see [SECURITY.md](SECURITY.md).

## Local development

1. Fork this repository and clone your fork.
2. Install a maintained Node LTS release and run `npm ci --ignore-scripts`.
3. Run `npm run demo` for a local synthetic venue, or follow the README to create an isolated installation.
4. Create a branch for one change. Keep it focused enough to review.
5. Run `npm test` and `npm run check`. For packaging changes, also run `npm run release`.
6. Open a pull request against `main`. Explain the problem, the resulting behaviour and how you checked it. Include before/after screenshots for interface changes.

The current tests run without Stripe keys, SMTP credentials or access to the live website. Never point development or tests at a live venue database, payment account or mail queue. Do not run the operator's Stripe catalog setup for ordinary contribution work.

## Design and implementation

- Follow the existing Express, vanilla JavaScript and CSS patterns; discuss new dependencies or major rewrites first.
- Preserve server-side authorization, origin checks and transactional booking rules. Frontend hiding is not access control.
- Keep one writer per database. Changes to persistence, tenancy, payment handling or data migration need an issue explaining the approach first.
- Add or update meaningful tests for changed behaviour. Documentation-only corrections do not need new tests.
- Use plain, helpful language in the interface. Check keyboard navigation and narrow screens when changing a user flow.
- Update the relevant documentation when behaviour or configuration changes.

The [roadmap](docs/ROADMAP.md) lists useful areas to explore. An item is an invitation to discuss, not a delivery promise or an assignment.

## Review and conduct

Be considerate, explain your reasoning and keep discussion about the work. Maintainers may request changes or decline proposals that do not fit the pilot's scope. Contributions are accepted under the repository's MIT licence; only submit material you have permission to contribute.
