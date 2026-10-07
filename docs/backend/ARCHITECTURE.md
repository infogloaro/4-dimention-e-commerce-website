# Architecture

## Decision: modular monolith inside the existing Next.js app

The repository was a bare Next.js 16 / React 19 / Tailwind 4 scaffold with no backend. The frontend spec (`docs/4D_Commerce_Advanced_Ecommerce_Frontend_Specification.docx`) recommends Next.js + TanStack Query and says business truth (price, stock, permissions, order state) must be server-authoritative. A **modular monolith using Next.js Route Handlers** gives the fastest path with end-to-end TypeScript, one deployable, and no network hop between UI and API. Business logic lives outside `app/` so it can be lifted into a standalone service (or Lambda handlers) later without rewriting.

```
Request
  → proxy.ts                    CORS allow-list, preflight, request-id
  → app/api/v1/**/route.ts      thin: declares auth/permission/schemas/rate-limit, calls ONE service function
  → server/core/http.ts route() request-id · rate limit · CSRF origin check · authN · RBAC · Zod validation · envelope · error mapping
  → server/services/**          business rules, transactions, idempotency
  → server/domain/**            PURE logic (pricing engine, order state machine) — no I/O
  → server/db/client.ts         Prisma 7 + pg driver adapter, pooled
  → PostgreSQL 17               constraints are the last line of defence
  → server/integrations/**      payments · notifications · storage (provider abstractions)
```

## Directory map

| Path | Purpose |
|---|---|
| `app/api/v1/**` | HTTP surface (163 operations — see [API.md](API.md)). Route files are 3-15 lines. |
| `server/core/` | env validation, errors, logger (with secret redaction), request context (AsyncLocalStorage), rate limiter, crypto (scrypt, HMAC), pagination, cache, idempotency, the `route()` wrapper |
| `server/auth/` | permission catalogue + role matrix, session service |
| `server/domain/` | `pricing.ts` (single price engine), `order-state.ts` (state machines) |
| `server/services/` | catalog (listing, search, product detail, categories, admin), cart, checkout, orders, payments, refunds, returns, inventory, coupons, shipping, reviews, recommendations, content/CMS, analytics, support, notifications, audit |
| `server/integrations/` | `payments/` (mock, Razorpay, Stripe), `notifications/` (console + registry), `storage/` (local, S3 presign, Cloudinary sign) |
| `server/validation/` | Zod schemas, shared by routes and tests |
| `server/db/generated/` | Prisma client (generated, git-ignored; `postinstall` regenerates) |
| `prisma/` | `schema.prisma`, `migrations/`, `seed.ts`, `seed-base.ts`, `seed-data.ts` |
| `tests/` | `unit/` (pure logic), `integration/` (real route handlers + real PostgreSQL), `support/` |
| `scripts/generate-api-docs.mjs` | regenerates `API.md`, `ERROR_CODES.md`, `openapi.json` from the code |

### Layering honesty
Route → service → data access is strict. Dedicated "repository" classes were **not** introduced for every aggregate: Prisma already is the typed data-access layer, and wrapping it 1:1 adds indirection without isolating anything. Where a query is complex (search, facets, analytics rollups, inventory updates) it is isolated in a named service function or a documented raw-SQL statement. Route handlers never touch Prisma directly except two trivial lookups in `admin/products/[id]` and `admin/refunds/[id]/process`.

## Cross-cutting rules

* **Money** is integer minor units (paise). No floats anywhere in persistence or arithmetic. Rounding: per line, half-up; discounts are allocated with the largest-remainder method so parts always sum exactly.
* **Server is authoritative.** Request schemas contain no price/total/permission fields; unknown keys are stripped (or rejected with `.strict()` on updates).
* **Transactions** (`withTransaction`) retry on serialization failure/deadlock. Inside a transaction every query must use the transaction client — a second pooled connection can starve the pool under load (this was found and fixed by the concurrency tests).
* **Idempotency** is built in where duplicates cost money: checkout (`Idempotency-Key` + DB record), payment confirmation/webhooks (row lock + terminal states + unique `(provider,eventId)`), refunds (unique key), stock operations (claim-then-apply on reservation rows).
* **Observability:** every response carries `X-Request-Id`; logs are JSON lines containing `requestId`/`actorId`; keys matching `password|token|secret|authorization|cookie|signature|card|otp…` are redacted at any depth.
* **Caching:** in-process TTL cache with request coalescing (`server/core/cache.ts`) for category tree, brands, collections, offers, home sections, dashboard. Public GET endpoints send `Cache-Control: s-maxage` so a CDN can absorb them. Swap `memo()` for Redis when running more than one instance.
