# API inventory

> Generated from the route handlers by `npm run docs:api` — **do not edit by hand.** 170 operations.

Base URL: `/api/v1`. All responses use the envelope in [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md). Machine-readable spec: [openapi.json](openapi.json).

**Auth column:** *Public* = no session needed · *Optional* = works for guests, richer when signed in · *Signed-in user* = any authenticated customer or staff · backticked values = RBAC permission(s) required (enforced server-side).

## AUTH

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/change-password` | Signed-in user |  |
| POST | `/api/v1/auth/forgot-password` | Public |  |
| POST | `/api/v1/auth/login` | Public |  |
| POST | `/api/v1/auth/logout` | Optional session / guest cart |  |
| GET | `/api/v1/auth/me` | Signed-in user |  |
| PATCH | `/api/v1/auth/me` | Signed-in user |  |
| POST | `/api/v1/auth/phone/request` | Signed-in user |  |
| POST | `/api/v1/auth/phone/verify` | Signed-in user |  |
| POST | `/api/v1/auth/refresh` | Signed-in user |  |
| POST | `/api/v1/auth/register` | Public |  |
| POST | `/api/v1/auth/resend-verification` | Signed-in user |  |
| POST | `/api/v1/auth/reset-password` | Public |  |
| GET | `/api/v1/auth/sessions` | Signed-in user |  |
| DELETE | `/api/v1/auth/sessions/:id` | Signed-in user |  |
| POST | `/api/v1/auth/verify-email` | Public |  |

## PRODUCTS

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/products` | Optional session / guest cart |  |
| GET | `/api/v1/products/:slug` | Public |  |
| GET | `/api/v1/products/:slug/questions` | Public |  |
| POST | `/api/v1/products/:slug/questions` | Signed-in user |  |
| GET | `/api/v1/products/:slug/recommendations` | Public | Grouped recommendations for the PDP: one request instead of three. |
| GET | `/api/v1/products/:slug/reviews` | Optional session / guest cart |  |
| POST | `/api/v1/products/:slug/reviews` | Signed-in user |  |
| POST | `/api/v1/products/:slug/view` | Optional session / guest cart | Fire from the product page after render to feed "Recently viewed" and popularity. |
| GET | `/api/v1/products/compare` | Public |  |

## CATEGORIES

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/categories` | Public | Full nested category tree with product counts — one cached call powers mega-menus and category rails. |
| GET | `/api/v1/categories/:slug` | Public |  |

## BRANDS

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/brands` | Public |  |
| GET | `/api/v1/brands/:slug` | Public |  |

## COLLECTIONS

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/collections` | Public |  |
| GET | `/api/v1/collections/:slug` | Public | Collection metadata. Fetch its products via GET /products?collection=<slug>. |

## SEARCH

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/search` | Optional session / guest cart |  |
| GET | `/api/v1/search/suggest` | Public | Lightweight autocomplete: top products (mini cards), categories, brands, popular queries, did-you-mean. |
| GET | `/api/v1/search/trending` | Public |  |

## RECOMMENDATIONS

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/recommendations` | Optional session / guest cart | Home-page recommendation groups in one call. |

## RECENTLY-VIEWED

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/recently-viewed` | Optional session / guest cart |  |
| DELETE | `/api/v1/recently-viewed` | Optional session / guest cart |  |

## CART

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/cart` | Optional session / guest cart |  |
| DELETE | `/api/v1/cart` | Optional session / guest cart |  |
| POST | `/api/v1/cart/coupon` | Optional session / guest cart |  |
| DELETE | `/api/v1/cart/coupon` | Optional session / guest cart |  |
| POST | `/api/v1/cart/items` | Optional session / guest cart |  |
| PATCH | `/api/v1/cart/items/:id` | Optional session / guest cart |  |
| DELETE | `/api/v1/cart/items/:id` | Optional session / guest cart |  |
| POST | `/api/v1/cart/merge` | Signed-in user | Login/register already merge automatically; this lets a client force a merge (e.g. after OAuth-style flows). |

## WISHLIST

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/wishlist` | Signed-in user |  |
| POST | `/api/v1/wishlist` | Signed-in user |  |
| DELETE | `/api/v1/wishlist/:productId` | Signed-in user |  |
| POST | `/api/v1/wishlist/:productId/move-to-cart` | Signed-in user |  |

## ADDRESSES

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/addresses` | Signed-in user |  |
| POST | `/api/v1/addresses` | Signed-in user |  |
| GET | `/api/v1/addresses/:id` | Signed-in user |  |
| PATCH | `/api/v1/addresses/:id` | Signed-in user |  |
| DELETE | `/api/v1/addresses/:id` | Signed-in user |  |
| POST | `/api/v1/addresses/:id/default` | Signed-in user |  |

## SHIPPING

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/shipping/estimate` | Public | Delivery-by-pincode checker for the product page / cart. |

## CHECKOUT

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| POST | `/api/v1/checkout/create` | Signed-in user | **Idempotency-Key required** — Creates the order (reserving stock) and, for ONLINE payments, the payment attempt. Requires an `Idempotency-Key` header: retrying with the same key never creates a second order. |
| POST | `/api/v1/checkout/validate` | Signed-in user | Dry-run: server-authoritative totals, shipping options, coupon results and stock issues. Creates nothing. |

## PAYMENTS

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| POST | `/api/v1/payments/confirm` | Signed-in user | Client reports the provider result; the server verifies it with the provider before changing anything. Idempotent. |
| POST | `/api/v1/payments/webhooks/:provider` | Public | Provider → us. No session/CSRF (it's server-to-server); authenticity comes from the provider signature, which is verified over the RAW body. Duplicate deliveries are acknowledged without re-processing. |

## ORDERS

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/orders` | Signed-in user |  |
| GET | `/api/v1/orders/:id` | Signed-in user | `id` may be the order UUID or the human order number (4D-YYMMDD-XXXXXX). |
| POST | `/api/v1/orders/:id/cancel` | Signed-in user |  |
| GET | `/api/v1/orders/:id/invoice` | Signed-in user | Structured invoice data; the frontend renders / prints it (PDF generation is a client concern). |
| POST | `/api/v1/orders/:id/pay` | Signed-in user | Retry payment for an order still waiting for it (reuses an open attempt if there is one). |
| POST | `/api/v1/orders/:id/returns` | Signed-in user |  |

## TRACKING

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/tracking/:id` | Signed-in user | Lean tracking payload for the animated timeline: progress stages, events, shipments, ETA. |

## RETURNS

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/returns` | Signed-in user |  |
| GET | `/api/v1/returns/:id` | Signed-in user |  |
| POST | `/api/v1/returns/:id/cancel` | Signed-in user |  |

## REVIEWS

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/reviews` | Signed-in user | The signed-in customer's own reviews (all statuses). |
| PATCH | `/api/v1/reviews/:id` | Signed-in user |  |
| DELETE | `/api/v1/reviews/:id` | Signed-in user |  |
| POST | `/api/v1/reviews/:id/helpful` | Signed-in user | Toggles the caller's "helpful" vote. |

## COUPONS

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/coupons/available` | Public | Publicly advertised offers for cart / checkout banners. |

## NOTIFICATIONS

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/notifications` | Signed-in user |  |
| POST | `/api/v1/notifications` | Signed-in user | Mark all (no body ids) or specific notifications as read. |

## SUPPORT

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/support/tickets` | Signed-in user |  |
| POST | `/api/v1/support/tickets` | Signed-in user |  |
| GET | `/api/v1/support/tickets/:id` | Signed-in user |  |
| POST | `/api/v1/support/tickets/:id` | Signed-in user |  |

## HOME

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/home` | Optional session / guest cart | Everything the home page needs, assembled from admin-managed sections (hero, rails, promos, personalised, recently viewed). |

## CONTENT

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/content/:placement` | Public | Active banners / promos for a placement, e.g. `category:audio`, `site.announcement`. |

## SETTINGS

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/settings/public` | Public |  |

## ADMIN

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/admin/analytics/customers` | `analytics:read` |  |
| GET | `/api/v1/admin/analytics/products` | `analytics:read` | Top products and category performance for the range. |
| GET | `/api/v1/admin/analytics/sales` | `analytics:read` |  |
| GET | `/api/v1/admin/audit-logs` | `audit:read` |  |
| GET | `/api/v1/admin/brands` | `product:read` or `brand:write` |  |
| POST | `/api/v1/admin/brands` | `brand:write` |  |
| PATCH | `/api/v1/admin/brands/:id` | `brand:write` |  |
| DELETE | `/api/v1/admin/brands/:id` | `brand:write` |  |
| GET | `/api/v1/admin/categories` | `product:read` or `category:write` |  |
| POST | `/api/v1/admin/categories` | `category:write` |  |
| PATCH | `/api/v1/admin/categories/:id` | `category:write` |  |
| DELETE | `/api/v1/admin/categories/:id` | `category:write` |  |
| POST | `/api/v1/admin/categories/reorder` | `category:write` |  |
| GET | `/api/v1/admin/collections` | `product:read` or `collection:write` |  |
| POST | `/api/v1/admin/collections` | `collection:write` |  |
| PATCH | `/api/v1/admin/collections/:id` | `collection:write` |  |
| DELETE | `/api/v1/admin/collections/:id` | `collection:write` |  |
| GET | `/api/v1/admin/content/blocks` | `content:write` |  |
| POST | `/api/v1/admin/content/blocks` | `content:write` |  |
| PATCH | `/api/v1/admin/content/blocks/:id` | `content:write` |  |
| DELETE | `/api/v1/admin/content/blocks/:id` | `content:write` |  |
| GET | `/api/v1/admin/content/sections` | `content:write` |  |
| PUT | `/api/v1/admin/content/sections` | `content:write` | Create or replace a home section by `key`. |
| PATCH | `/api/v1/admin/content/sections` | `content:write` |  |
| DELETE | `/api/v1/admin/content/sections/:id` | `content:write` |  |
| GET | `/api/v1/admin/coupons` | `coupon:read` |  |
| POST | `/api/v1/admin/coupons` | `coupon:write` |  |
| GET | `/api/v1/admin/coupons/:id` | `coupon:read` | Coupon + usage analytics (uses, total discount, revenue influenced, unique users, recent redemptions). |
| PATCH | `/api/v1/admin/coupons/:id` | `coupon:write` | Also the activate / deactivate switch: PATCH { isActive }. |
| DELETE | `/api/v1/admin/coupons/:id` | `coupon:write` |  |
| GET | `/api/v1/admin/customers` | `customer:read` |  |
| GET | `/api/v1/admin/customers/:id` | `customer:read` |  |
| PATCH | `/api/v1/admin/customers/:id/status` | `customer:write` | Suspend / ban / reactivate. Non-active statuses immediately revoke every session. Audited. |
| GET | `/api/v1/admin/dashboard` | `dashboard:read` | KPIs, 30-day trend, top products, low stock, recent orders — served from rollups + a 30 s cache. |
| GET | `/api/v1/admin/inventory` | `inventory:read` |  |
| PATCH | `/api/v1/admin/inventory/:variantId` | `inventory:write` | Low-stock threshold / backorder policy for one variant. |
| POST | `/api/v1/admin/inventory/adjust` | `inventory:write` | Signed stock adjustment with a mandatory reason. Cannot push on-hand below reserved units. Audited. |
| GET | `/api/v1/admin/inventory/low-stock` | `inventory:read` |  |
| GET | `/api/v1/admin/inventory/movements` | `inventory:read` |  |
| POST | `/api/v1/admin/inventory/receive` | `inventory:write` | Record a supplier receipt (restock). `reference` is unique, so a double-submit cannot double-count stock. |
| POST | `/api/v1/admin/media/sign` | `product:write` or `content:write` or `category:write` or `brand:write` | Ask where to upload. `mode: "direct"` (S3/Cloudinary) returns a presigned request the browser sends straight to object storage; `mode: "server"` (local dev) means POST the file to /admin/media/upload. |
| POST | `/api/v1/admin/media/upload` | `product:write` or `content:write` or `category:write` or `brand:write` | Server-side upload (local storage provider only). File content is sniffed — the declared type is never trusted. |
| GET | `/api/v1/admin/notification-deliveries` | `notification:manage` | Outbound email/SMS/WhatsApp delivery log. Recipients are masked and payloads are not returned. |
| GET | `/api/v1/admin/orders` | `order:read` |  |
| GET | `/api/v1/admin/orders/:id` | `order:read` |  |
| POST | `/api/v1/admin/orders/:id/refunds` | `order:refund` | **Idempotency-Key required** — Manual (partial or full) refund. `Idempotency-Key` required: a retried request can never refund twice. |
| POST | `/api/v1/admin/orders/:id/shipments` | `order:update` or `shipping:manage` |  |
| POST | `/api/v1/admin/orders/:id/status` | `order:update` | Move an order along the state machine; illegal transitions return ORDER_STATE_INVALID with the allowed targets. |
| POST | `/api/v1/admin/orders/:id/tracking` | `order:update` |  |
| GET | `/api/v1/admin/orders/queues` | `order:read` | Live work queues + exceptions for the order desk (uncached, cheap counts). `since` powers the "new orders" indicator. |
| GET | `/api/v1/admin/payments` | `order:read` | Payment attempts across all orders. Provider secrets, client payloads and card data are never returned. |
| GET | `/api/v1/admin/payments/webhooks` | `order:read` | Received payment-provider webhook events and their processing outcome (payloads are not returned). |
| GET | `/api/v1/admin/products` | `product:read` |  |
| POST | `/api/v1/admin/products` | `product:write` |  |
| GET | `/api/v1/admin/products/:id` | `product:read` |  |
| PATCH | `/api/v1/admin/products/:id` | `product:write` |  |
| DELETE | `/api/v1/admin/products/:id` | `product:delete` | Soft delete: product is archived and hidden; order history keeps its snapshots. |
| POST | `/api/v1/admin/products/:id/variants` | `product:write` |  |
| POST | `/api/v1/admin/products/bulk` | `product:write` |  |
| GET | `/api/v1/admin/questions` | `review:moderate` |  |
| POST | `/api/v1/admin/questions/:id` | `review:moderate` | Post an official answer (also approves the question). |
| PATCH | `/api/v1/admin/questions/:id` | `review:moderate` | Approve / reject a customer question. |
| GET | `/api/v1/admin/refunds` | `order:refund` or `order:read` | Refund records across all orders (pending offline refunds, provider failures, completed). |
| POST | `/api/v1/admin/refunds/:id/process` | `order:refund` | Confirm an offline refund (COD / bank transfer) has been paid out. Idempotent. |
| GET | `/api/v1/admin/returns` | `return:manage` |  |
| POST | `/api/v1/admin/returns/:id/advance` | `return:manage` | PICKUP_SCHEDULED → PICKED_UP → RECEIVED. RECEIVED restocks items and triggers the refund. |
| POST | `/api/v1/admin/returns/:id/decision` | `return:manage` |  |
| GET | `/api/v1/admin/reviews` | `review:moderate` |  |
| POST | `/api/v1/admin/reviews/:id/moderate` | `review:moderate` |  |
| GET | `/api/v1/admin/roles` | `user:manage` or `role:manage` |  |
| PUT | `/api/v1/admin/roles/:id/permissions` | `role:manage` | Replace a role's permission set. Super-admin only (`role:manage`). Audited with before/after. |
| GET | `/api/v1/admin/settings` | `settings:manage` |  |
| PUT | `/api/v1/admin/settings/:key` | `settings:manage` |  |
| GET | `/api/v1/admin/shipments` | `order:read` or `shipping:manage` | Shipments across all orders, with filters for delivery exceptions and missing tracking numbers. |
| PATCH | `/api/v1/admin/shipments/:id` | `order:update` or `shipping:manage` | Carrier-style status update (Reached hub, Out for delivery, Delivered ...) — also advances the order and feeds the tracking timeline. |
| GET | `/api/v1/admin/system` | `settings:manage` | Integration readiness + operational signals. Reports whether credentials exist, never their values. |
| GET | `/api/v1/admin/tickets` | `support:read` |  |
| GET | `/api/v1/admin/tickets/:id` | `support:read` |  |
| POST | `/api/v1/admin/tickets/:id` | `support:reply` |  |
| PATCH | `/api/v1/admin/tickets/:id` | `support:reply` |  |
| GET | `/api/v1/admin/users` | `user:manage` | Staff accounts (anyone whose role is a staff role). |
| POST | `/api/v1/admin/users` | `user:manage` |  |
| PATCH | `/api/v1/admin/users/:id/role` | `user:manage` | Change a user's role. Revokes their sessions so the new permission set applies immediately. Audited as `user.role_changed`. |
| PATCH | `/api/v1/admin/variants/:id` | `product:write` |  |
| DELETE | `/api/v1/admin/variants/:id` | `product:write` |  |

## JOBS

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| POST | `/api/v1/jobs/maintenance` | Public | Scheduler hook (EventBridge / cron / Vercel Cron): expires unpaid reservations, refreshes yesterday+today analytics, purges expired sessions/tokens/idempotency records. Authenticated with `Authorization: Bearer $JOBS_TOKEN` (min 24 chars; endpoint is disabled when unset). |

## HEALTH

| Method | Path | Auth / permission | Notes |
|---|---|---|---|
| GET | `/api/v1/health` | Public | Liveness + DB readiness probe. |

## Error codes

See [ERROR_CODES.md](ERROR_CODES.md).
