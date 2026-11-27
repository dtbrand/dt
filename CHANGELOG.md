# Changelog — DT Brand's & Jai Hanuman Tex

All notable changes are documented here. The repo uses
[Release Please](https://github.com/googleapis/release-please) (`.github/workflows/release-please.yml`,
`release-please-config.json`, `.release-please-manifest.json`) with
[Conventional Commits](https://www.conventionalcommits.org/) enforced by
`commitlint.config.js` — commit messages feed this changelog and the releases.

Project started 2026-08-14; **1,229 commits** as of 2026-09-13.

## [1.1.0](https://github.com/dtbrand/dt/compare/dtbrand-arniya-v1.0.0...dtbrand-arniya-v1.1.0) (2026-11-27)


### Features

* **admin:** serve real full 231-page Admin Panel on Cloudflare Workers with D1 SQL, KV & email wiring ([15e362b](https://github.com/dtbrand/dt/commit/15e362b169f2614746604528021c8d4d68ea535a))
* **cloudflare:** add Worker edge proxy and Wrangler config ([d830fca](https://github.com/dtbrand/dt/commit/d830fca41fa9d56517827a5eba56ef1ffe281f47))
* **cloudflare:** deploy D1 storefront and remove hardcoded domains ([23488a6](https://github.com/dtbrand/dt/commit/23488a606968f586a6f6b758558d7c33b7dde972))
* **cloudflare:** map all APIs, D1 SQL, KV storage, email outbox, and admin console ([464173f](https://github.com/dtbrand/dt/commit/464173f644b179d288a6807e99aa956ebc18d589))


### Bug Fixes

* **admin:** eliminate template-literal quote syntax error and harden /admin UI ([d56a6cb](https://github.com/dtbrand/dt/commit/d56a6cb56bc289e06af5b7d9895971cb8b5c087d))
* **cloudflare+admin+storefront:** resolve live E2E bugs across track, quickview, admin exports, reviews, customers, shipping pincode, SVG and assets ([1fee82d](https://github.com/dtbrand/dt/commit/1fee82d5c0f1c82688e3608755a9406eff9b3914))
* **cloudflare:** add previews.vars block to wrangler.toml ([e5e03b7](https://github.com/dtbrand/dt/commit/e5e03b72a094a7d720e9e6d43f9206f70a0446a9))
* **cloudflare:** inject edge bridge before first head, streamline customer edit hydration, and fix dynamic PDP E2E target ([34ded9a](https://github.com/dtbrand/dt/commit/34ded9a9df24c2b535ab259f718933835fcab67d))
* **storefront:** map live category slugs to mobile mega-menu weave subcategories ([2dd2ff5](https://github.com/dtbrand/dt/commit/2dd2ff57791c89cd473c8f4bb0f0109a5fbab365))

## [Unreleased]

### Added
- Root documentation suite: `ARCHITECTURE.md`, `API.md`, `DATABASE.md`,
  `DEPLOYMENT.md`, `TESTING.md`, `CODE_OF_CONDUCT.md` and this changelog,
  all verified against the working tree (2026-09-13 audit).
- `docs/audits/2026-09-13-master-audit.md` — evidence-based master audit.

### Fixed
- (pending) Known issues logged in the 2026-09-13 master audit:
  `DTBrand\RateLimiter` namespace fatal on the auth API router;
  `api/developer.php` static calls to instance `AuditManager::log()`;
  undefined `$data` in the Cashfree webhook handler; stale README claims.

## [2.0.0] — 2026-09-07

First recorded release in `.release-please-manifest.json` (installer version `2.0.0`,
`.installed` marker). Highlights up to this release, from the commit ledger:

### Added
- **Admin suite sections 25–40:** customer role hubs, inventory ledger + export
  studio, coupons & discount rules, shipping admin, payment admin with webhook
  replay protection, content/marketing admin, reviews admin, notifications with
  DLQ retry, integrations with secret masking + diagnostics, reports & export
  studio, admin users/roles/permissions, enterprise audit log (15 domains,
  secret masking, JSON diffs), system admin (12 sub-pages), developer &
  webhook-queue suite, admin UI component library (24 canonical components),
  database integrity + price history audit ledger.
- **Security sections 34 & 49–61:** admin security matrix, auth hardening,
  rate limiting, credential defense, installer lockdown, CSRF protection,
  IDOR resolution, API security/headers/uploads suite, unauthenticated order
  details now 401 before any DB query.
- **Cart/checkout hardening:** coupon validation wired live in the cart drawer;
  cart, wishlist, checkout, payment idempotency and stock safety suites.
- **B2B portals:** WhatsApp inquiry deep links in wholesale/reseller/retailer,
  unified `dtAdminFetch` with CSRF safety, create-order action + export studio
  link, `Money` engine across admin.
- **Deployment:** dual-target FTP triple-sync (HarmitEthnic + JaiHanumanTex)
  with binary TYPE I; customer portal files registered in the sync list;
  `Database` unified with `config/database.php` fallback.

### Changed
- Replaced raw browser `alert()` dialogs with luxury toast notifications across
  admin modules, checkout, auth and reseller portals.
- Admin sidebar navigation overhaul + full admin files audit with CRUD wire-up.

## Earlier development (2026-08-14 → 2026-09-06)

Foundation phase — initial schema and migrations, storefront pages, four
channel portals, WhatsApp CRM hand-off, payment gateways (Razorpay, Cashfree,
UPI deep links, COD), courier webhooks (Delhivery, BlueDart, TCI), CI/CD
(CodeQL, Trivy, Scorecard, Release Please), Playwright e2e, and the
consolidation of legacy `Frontend/` routes into the single root tree via
canonical 301 redirects. Full history:
`git log --oneline` (1,229 commits).

[Unreleased]: https://github.com/dtbrand/arniya/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/dtbrand/arniya/releases/tag/v2.0.0
