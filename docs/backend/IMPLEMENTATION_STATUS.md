# Implementation status

_Last verified: 2026-10-05 — `typecheck`, `lint`, `build` clean; **155/155 tests pass** (42 unit + 113 integration, real PostgreSQL)._

## Phase 1 — repository audit (starting point)
* Bare `create-next-app` scaffold: Next 16.3.8, React 19.2.8, Tailwind 4, TypeScript strict, ESLint 9; deps already present: Zod 4, TanStack Query, Zustand, RHF, Framer Motion, GSAP, shadcn. One commit, no backend, no database, no API routes, default home page, no tests, `.env*` git-ignored.
* Spec document read in full: `docs/4D_Commerce_Advanced_Ecommerce_Frontend_Specification.docx` (frontend-first; Part 11 "Data/API integration contract" defines the API domains; server-authoritative price/inventory/permissions/order/payment state; admin console modules; home/CMS content; analytics events; vertical-slice rule *Home → Category → Product → Cart → Checkout → Order → Tracking*). No conflicts with the backend brief were found; extra spec items were added (compare, Q&A, support tickets, save-for-later, delivery-by-pincode, invoice data, recently viewed).
* Existing frontend code was **not modified** (only `next.config.ts`, `eslint.config.mjs`, `.gitignore`, `package.json` were extended).

## Decisions
Modular monolith in Next.js route handlers · PostgreSQL + Prisma 7 (stable 7.10; 8.0 is only an RC) · opaque DB sessions · Zod validation · integer money · tax-inclusive pricing by default · account required for checkout · see [ARCHITECTURE.md](ARCHITECTURE.md).

## Delivered vs. brief (honest scorecard)
| Area | Status | Evidence |
|---|---|---|
| Database schema, migrations, indexes, seed | ✅ | 65 tables, 4 migrations, DB CHECK constraints, seed runs end-to-end |
| Auth, sessions, password reset, email/phone verification, lockout, CSRF | ✅ | `auth.test.ts` (19) |
| RBAC (8 roles, 29 permissions, DB-backed) + audit log | ✅ | role×endpoint matrix over 36 admin ops; route-file scan; audit tests |
| Catalogue: products, variants (dynamic attributes), categories (tree), brands, collections, media metadata, SEO | ✅ | `catalog.test.ts` (17) |
| Search: fuzzy, synonyms, SKU, suggest, trending, facets, filters, sort, pagination caps | ✅ | `catalog.test.ts` |
| Inventory: reservations, ledger, receipts, adjustments, no-oversell | ✅ | race tests (1 unit/2 buyers; 3 units/10 buyers), DB-constraint test |
| Pricing engine, coupons (all rule types incl. stacking, per-user, first-order), shipping zones/rates, tax | ✅ | `pricing.test.ts` (18) + cart/checkout tests |
| Cart (guest/user/merge/save-for-later/coupons/price-change flags), wishlist, addresses, recently viewed, recommendations | ✅ | `cart.test.ts` (13) |
| Checkout + idempotency + COD + online payments + webhooks + retries + late-capture refunds | ✅ with MOCK provider | `checkout.test.ts` (29) |
| Razorpay / Stripe adapters | ⚠️ written to the providers' public docs, **never run against a live account** | needs credentials |
| Orders: state machine, history, tracking timeline, shipments, cancel, invoice data | ✅ | `checkout.test.ts`, `fulfilment.test.ts` (9) |
| Returns (partial), refunds (partial, idempotent, COD manual), replacements | ✅ | `fulfilment.test.ts` |
| Reviews (verified-purchase from ledger, moderation, helpful votes), Q&A | ✅ | `fulfilment.test.ts` |
| Notifications: in-app + email/SMS/WhatsApp **abstraction**, outbox, templates | ⚠️ in-app complete; external channels use the console provider (no real adapter shipped) | |
| Admin APIs: dashboard, analytics (rollups), products, taxonomy, inventory, orders, returns, customers, coupons (+analytics), reviews, CMS, support, roles/users, settings, audit | ✅ | `admin.test.ts` (26) |
| CMS / home page composition | ✅ | `admin.test.ts` |
| Media abstraction (local, S3 presign, Cloudinary sign) | ⚠️ local tested via sniffing logic; S3/Cloudinary signing written from spec, not run against live services | |
| Security headers, CORS, rate limits, size limits, validation, redaction | ✅ | unit + integration + live smoke test of the production build |
| Docs, OpenAPI, frontend contract | ✅ | `docs/backend/*` (API/ERROR_CODES/OpenAPI generated from code) |

## Verification performed
* `npm run typecheck` ✅ · `npm run lint` ✅ (tests override `no-explicit-any` because they assert on loosely-typed JSON) · `npm run build` ✅ (163 API operations compiled).
* `npm test` ✅ 155/155 (≈2.5 min). Critical workflow `register → login → browse → product → cart → checkout → payment → order → tracking → fulfilment → DELIVERED` is a single test.
* **Live smoke test** of `next start` (production mode) against the seeded DB: health, listing, Secure/HttpOnly cookies, CSRF rejection from a foreign origin, RBAC 403 for a customer on admin routes, admin dashboard, home composition. This surfaced (and confirmed) the production guard that refuses placeholder secrets / the mock payment provider.
* Bugs found **by the tests** and fixed during the build: pool starvation when category lookups used a second connection inside checkout transactions (10-way race), bulk price-adjust SQL type error, service-level `addItem` defaulting, DB-test timing assumptions.

## Known limitations & remaining work
1. External notification providers (SES/Twilio/WhatsApp) — register via `registerProvider()`.
2. Live verification of Razorpay/Stripe/S3/Cloudinary integrations with real credentials.
3. Rate limiter + cache are in-process; use Redis before running multiple instances.
4. Admin CRUD for shipping zones/rates, promotional notification sends and attribute management are not exposed (data model and permissions exist).
5. Guests cannot check out (by design); guest wishlist/compare are client-side.
6. Analytics days are UTC; "today" lags up to 60 s.
7. Prisma's query interpreter emits a pg `client.query() while already executing` **deprecation warning** inside some interactive transactions (harmless on pg 8; track Prisma/pg release notes before pg 9).
8. `npm audit`: 12 high, all dev-tooling transitive (see SECURITY.md).
9. Frontend is untouched — see [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md) for the next step.
