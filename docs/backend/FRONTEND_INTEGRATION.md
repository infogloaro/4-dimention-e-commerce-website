# Frontend integration contract

Written for the frontend implementation (Next.js · TanStack Query · Zustand · React Hook Form + Zod · Framer Motion/GSAP). Every statement here is exercised by the integration tests.

## 1. Base URL & transport
* Same origin: `/api/v1/...` (the API lives in the same Next.js app). Other origins must be listed in `CORS_ALLOWED_ORIGINS`.
* `fetch(..., { credentials: "include" })` — auth is an `HttpOnly` cookie. Never read or store the session token in JS.
* JSON only (`Content-Type: application/json`), except `POST /admin/media/upload` (multipart).
* Every response has `X-Request-Id` (also in the body); show it in "something went wrong" screens and support tickets.

## 2. Envelope
```jsonc
// success
{ "success": true, "data": <payload>, "meta": { … } }          // meta only for lists / extras
// failure
{ "success": false, "error": { "code": "OUT_OF_STOCK", "message": "…", "details": { … } }, "requestId": "…" }
```
`204` responses have no body (logout, deletes). Money is **integer minor units** (₹499.00 = `49900`; format with `Intl.NumberFormat("en-IN",{style:"currency",currency})`). Dates are ISO-8601 UTC.

## 3. Pagination
`?page=1&pageSize=24` (max 100). `meta = { page, pageSize, total, totalPages, hasNextPage, hasPreviousPage }`. For infinite scroll use `useInfiniteQuery` with `getNextPageParam: m => m.hasNextPage ? m.page + 1 : undefined`, and pass `facets=false` on pages ≥ 2. Offset depth is capped at 10 000 rows: refine filters instead of paging that deep.

## 4. Errors → UI (matches spec §14)
| HTTP | Meaning | UI |
|---|---|---|
| network failure | — | retry button |
| 401 `UNAUTHENTICATED` | no/expired session | try `POST /auth/refresh` once, else login (keep the intended route) |
| 403 `FORBIDDEN` / `CSRF_REJECTED` | missing permission | permission-denied state |
| 404 `*_NOT_FOUND` | contextual 404 | |
| 409 | state changed (`OUT_OF_STOCK`, `INSUFFICIENT_STOCK{available}`, `PRICE_CHANGED{actualTotal}`, `ORDER_STATE_INVALID`, `COUPON_*` are 422) | explain what changed + **refetch the relevant queries** |
| 422 `VALIDATION_ERROR` | `details.fields[{path,message}]` | map to React Hook Form `setError(path, …)` |
| 423 `ACCOUNT_LOCKED` | `details.retryAfterMinutes` | |
| 429 `RATE_LIMITED` | `Retry-After` header | back off |
| 5xx | `INTERNAL_ERROR` / `SERVICE_UNAVAILABLE` | friendly message + retry + request id |
Full list: [ERROR_CODES.md](ERROR_CODES.md).

## 5. Authentication
`POST /auth/register|login` → sets cookie, returns `{ user, session:{expiresAt} }`. `GET /auth/me` → `{ user: { id,name,email,phone,avatarUrl,role,isStaff,emailVerified,phoneVerified,permissions[] } }` (`permissions` only for staff — use it to show/hide admin UI; the backend still enforces). Guest cart is merged automatically on login/register. `POST /auth/logout` (204). Password reset: `forgot-password` (always 202) → emailed link carries `token` → `reset-password {token,password}`. Email link target: `${APP_URL}/verify-email?token=…` and `/reset-password?token=…` (frontend routes you need to create).

## 6. TanStack Query suggestions
| Query key | Endpoint | Freshness / invalidation |
|---|---|---|
| `['categories']` | `GET /categories` | staleTime 5 min; prefetch on app load for the mega-menu |
| `['home']` | `GET /home` | 1 min |
| `['products', params]` | `GET /products?…` | 30 s; `keepPreviousData` for filter changes; keep filters in the URL |
| `['product', slug]` | `GET /products/:slug` | 1 min; invalidate nothing on cart actions |
| `['suggest', q]` | `GET /search/suggest?q=` | debounce 150–250 ms, `staleTime` 30 s |
| `['cart']` | `GET /cart` | **every cart mutation returns the new cart → `setQueryData(['cart'], res.data)`**; also invalidate after login/checkout |
| `['orders']`, `['order', id]`, `['tracking', id]` | orders/tracking | invalidate after cancel/return/payment confirm; poll tracking every 30–60 s only while the page is open |
| `['wishlist']` | `GET /wishlist` (`?idsOnly=true` for hearts) | optimistic add/remove |
Never cache payment confirmation as permanent client truth: after `payments/confirm`, refetch the order.

## 7. Product pages & filters
See [PRODUCTS.md](PRODUCTS.md): cards carry image/hover image/badges/rating/price/swatches/stock status; detail carries `options[]` + `variants[]` with per-variant `availability` and per-value `available` (render unavailable options **disabled**); changing a variant should switch to `variant.price`, `variant.sku`, `media` where `variantId` matches (or `mediaIds`), and `availability`. Filter UI = `meta.facets` (counts, `selected`); send them back as query params (`brand=`, `minPrice=`, `attr.color=`). Quick-view = `GET /products/:slug` (cached) or the card itself.

## 8. Cart → checkout → payment
1. Add to cart: `POST /cart/items {variantId, quantity}` (optimistic UI; roll back on 409 using `details.available`).
2. Cart page: render straight from `cart.pricing` — **do no maths**. Show `rejectedCoupons[].message`, `freeShippingRemaining`, per-line `issues[]` and `priceChanged`.
3. Checkout: pick address (`/addresses`), then `POST /checkout/validate {addressId, shippingMethod?, couponCodes?}` on every change; show `shipping.options[]` with `estimatedDelivery`.
4. Place order: generate `const key = crypto.randomUUID()` **once per attempt**; `POST /checkout/create` with header `Idempotency-Key: key` and `expectedTotal` = the total the user saw. Reuse the same key on retry/double-click.
   * `409 PRICE_CHANGED` → show the new total and ask to confirm (re-validate, new key).
   * `nextAction: "ORDER_CONFIRMED"` (COD) → success page with `order.orderNumber`.
   * `nextAction: "COMPLETE_PAYMENT"` → open the provider SDK with `payment.clientPayload`, start a countdown from `reservationExpiresAt`.
5. After the SDK finishes → `POST /payments/confirm {paymentId, providerPayload}` → `outcome`: `SUCCESS` (success page) · `FAILED_CAN_RETRY` (offer retry → `POST /orders/:id/pay`, then SDK again) · `PENDING` (poll `GET /orders/:id`, the webhook will settle it). Do not claim "order placed" unless `SUCCESS`/`order.status === "PLACED"`.
6. Dev with the mock provider: `clientPayload = { provider:"mock", paymentRef }`; confirm with `{ outcome:"success", signature: HMAC_SHA256(PAYMENT_WEBHOOK_SECRET, paymentRef+":success") }` (tests: `mockSign`).

## 9. Orders & tracking timeline
`GET /tracking/:id` → `progress[]` (stages with `completed|current|upcoming|skipped`) for the animated progress bar, `events[]` (newest first) for the detailed list, `shipments[]`, `estimatedDelivery`. Animate between states from the data; **do not fake progress with timers**. Order `actions` flags decide which buttons appear (cancel / return / review / pay / invoice).

## 10. Home, CMS, promotions
`GET /home` returns ordered `sections[{key,type,title,subtitle,data}]` — types `HERO, CATEGORY_RAIL, PRODUCT_RAIL, CONTENT_BLOCKS, COLLECTION, RECENTLY_VIEWED, PERSONALIZED, TRUST_BADGES, CUSTOM` — plus `announcement` and public `settings`. Render by `type`; sections are reordered/scheduled from the admin API, so don't hardcode marketing content. `GET /content/:placement` for page-specific banners (`category:audio`). `GET /coupons/available` for offer chips.

## 11. Media
All media are URLs (`image.url`, `thumbnailUrl`, `width`, `height`, `alt`, `type`). Use `thumbnailUrl` in grids/suggestions; reserve space with `width/height` to avoid layout shift. Add the media host to `images.remotePatterns` in `next.config.ts` (seed data uses `picsum.photos`). Videos have `durationSec`. Admin uploads: `POST /admin/media/sign {contentType, folder}` → if `mode:"direct"` do the returned `upload` request straight to storage, then store `publicUrl` on the product; if `mode:"server"` (local dev) `POST /admin/media/upload` as multipart.

## 12. Loading / empty / error states
Skeleton geometry can use `pageSize`; empty lists return `[]` with `meta.total = 0` (search/listing adds `meta.emptyState` suggestions); cart empty → `items: []`; unauthenticated customer endpoints → `401`. Optimistic mutations: wishlist, cart quantity, address default.

## 13. Admin UI
Use `/auth/me` `permissions[]` to render navigation; call admin endpoints with the same cookie. Tables map to paginated list endpoints with `search`/filters; **preserve filter state in the URL** when navigating to detail pages. Destructive actions need confirmation in the UI; the API additionally requires the matching permission and audits the action. Refund calls need an `Idempotency-Key` header.

## 14. Analytics events (spec §23)
Event capture is a frontend concern; the backend already feeds `search_*` (SearchLog) and `view_product` (`POST /products/:slug/view`). `order_created`, `payment_*`, `order_cancelled`, `return_requested`, `review_submitted` are derivable server-side from the audit log/orders.

## 15. Not yet provided by the backend
Real email/SMS/WhatsApp providers (console only), a server-side "compare" list (compare client-side, then `GET /products/compare?ids=`), live Razorpay/Stripe verification (adapters written, not run against live accounts), promotional-notification and shipping-rate admin endpoints.
