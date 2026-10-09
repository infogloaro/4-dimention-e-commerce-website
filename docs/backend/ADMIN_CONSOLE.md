# Admin console (`/admin`)

Next.js client console over the existing `/api/v1/admin/**` API. No schema/migration changes. The storefront (`/`, `/checkout`) is untouched.

## Run
```
npm run db:up && npm run db:migrate && npm run db:seed   # once
npm run dev                                              # http://localhost:3000/admin  (seed admin: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from .env)
npm run typecheck && npm run lint && npm test && npm run build
```

## Architecture
* `app/admin/login` (public) and `app/admin/(console)/**` (guarded by `AuthGate`: `/auth/me` must return a staff user, otherwise redirect to login; `next` is restricted to `/admin…` paths).
* `lib/admin/` – API client (envelope, errors, idempotency keys), formatting (paise → ₹, IST display, CSV with formula-injection guard), permission-aware nav.
* `components/admin/` – shell, UI kit (tables, dialogs on native `<dialog>`, toasts, URL-backed filters), field-spec CRUD, SVG charts, product form.
* **Security model:** the UI hides what a role can’t use, but every call is enforced by the API (`permission:` on every route; a test fails if a route lacks it). Server-rendered pages contain no data; all data comes from permissioned endpoints.
* Display timezone is IST; analytics rollups are UTC days (labelled in the UI).

## New API endpoints (read-only, all permissioned, rate-limited)
| Endpoint | Permission | Notes |
|---|---|---|
| `GET /admin/payments` | `order:read` | filters: status, provider, dates, search. No client payloads/card data. |
| `GET /admin/payments/webhooks` | `order:read` | event id/type/outcome only (no payload). |
| `GET /admin/refunds` | `order:refund` or `order:read` | |
| `GET /admin/shipments` | `order:read` or `shipping:manage` | `exceptions`, `missingTracking` filters. |
| `GET /admin/notification-deliveries` | `notification:manage` | recipients masked, no payloads. |
| `GET /admin/system` | `settings:manage` | integration readiness (never secret values) + operational signals. |

## Module status
| Module | Status | Evidence / gaps |
|---|---|---|
| Auth, shell, nav, permission gating | Complete | login/guard/redirect; RBAC matrix test extended with the 6 new endpoints |
| Dashboard | Complete | all figures from `/admin/dashboard`; no synthetic data |
| Analytics | Partial | sales/category/product/customer/funnel + CSV. **Missing:** revenue by brand, payment-method mix, refund/cancel trend, stock ageing, coupon performance dashboard, fulfilment SLA (need new aggregation endpoints) |
| Products & variants | Complete | list/filter/bulk (with price preview)/CSV, multi-section create/edit, spec templates, uploads, variant price + add. Gaps: related products, warranty/shipping dimensions are spec rows (no dedicated fields), CSV *import*, per-category server-side spec definitions |
| Categories, brands, collections | Complete* | CRUD. *Collection product membership and brand/category image upload are URL-only |
| Inventory | Complete | stock list, adjust (reason required), receive, policy, ledger. No warehouses/transfers/suppliers/POs (not in data model) |
| Orders & fulfilment | Complete | list + status tabs + CSV; workspace with state-machine transitions, shipment creation (PACKED only), shipment status, tracking notes, refunds (idempotent), packing slip. Gaps: partial/multi-shipment item selection UI, hold/release, internal order notes, labels, invoice print |
| Returns | Partial | approve/reject/pickup/receive. No inspection/condition grading or exchange-specific flow (model supports `REPLACEMENT` resolution only as a flag) |
| Refunds & payments | Complete (read) | lists + offline payout confirmation; reconciliation tooling beyond lists/webhook log is not built |
| Customers | Complete | list/detail/suspend/ban/reactivate; exports exclude phone/address |
| Coupons | Partial | CRUD/activate/usage stats. Product/category restrictions are API-only |
| Reviews, questions | Complete | moderation + official answers |
| CMS | Partial | blocks and home sections CRUD. No pages/menus/blog/SEO manager; media library = upload inside product form only |
| Support | Partial | tickets + replies. No internal notes/assignment/SLA |
| Staff, roles, audit | Complete | create staff, change role, permission matrix, audit viewer + CSV |
| Settings & system | Partial | key/value settings (secret-looking keys blocked in UI); health page. Tax/shipping-zone/rate CRUD and provider credential entry are intentionally not exposed |
| Marketing campaigns/newsletter, abandoned carts, saved views, dark mode | Not started | |

## Verification (2026-10-09)
`tsc --noEmit` clean · `eslint` 0 errors (9 `<img>` warnings) · `next build` OK (all `/admin/**` routes compiled) · `vitest` **161/161** (155 existing + 6 new; real PostgreSQL test DB) · new endpoints smoke-tested with curl against the seeded dev DB.
**Not done:** the UI was **not** exercised in a real browser in this session (no browser tool was available), so layout, dialogs and client interactions are verified only by type-checking, linting, building and API-level tests. No component tests exist.

## Open business decisions / external setup
* Return window, restocking fees, warranty exceptions: only `store.policies.returnWindowDays` exists; nothing else is invented.
* Carrier integration, real email/SMS/WhatsApp providers, live Razorpay/Stripe and S3/Cloudinary remain unconfigured (see System health page); the mock payment provider is development-only.
