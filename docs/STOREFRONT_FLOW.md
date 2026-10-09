# Storefront ⇄ backend flow (what is wired, what still needs credentials)

## Routes
| Route | Purpose | Backend used |
|---|---|---|
| `/` | Home: hero, new arrivals, Product DNA, categories, featured edit, offers | `GET /products`, `/categories`, `/products/:slug`, `/coupons/available` |
| `/products` | Listing, search, category/brand/price/stock/rating filters, sort, pagination (all in the URL) | `GET /products` (+facets) |
| `/products/[slug]` | Detail: variant picker, per-variant gallery, specs, reviews, related | `getProductDetail` (server), `/reviews`, `/recommendations` |
| `/cart` + drawer | Server-priced cart, coupons | `/cart*` |
| `/login` | Sign in / register (merges the guest cart) | `/auth/*` |
| `/checkout` | Address, delivery method, payment, server totals, idempotent place-order | `/addresses`, `/checkout/validate`, `/checkout/create` |
| `/checkout/success?order=` | Confirmation; state read from the protected API only | `GET /orders/:numberOrId` |
| `/account/orders`, `/account/orders/[id]` | History, tracking, cancel, return | `/orders*`, `/orders/:id/cancel`, `/orders/:id/returns` |
| `/account/wishlist` | Wishlist | `/wishlist` |
| `/admin` | Order desk (live queues, 20 s refresh), bell alerts | `GET /admin/orders/queues` (new) |

## Rules enforced
* Prices, discounts, shipping, tax and totals come only from the server; checkout sends `expectedTotal` and the server answers `409 PRICE_CHANGED` on drift.
* One `Idempotency-Key` per distinct attempt; a ref guard blocks double-clicks. The cart is cleared by the server only when the order is placed.
* The confirmation page distinguishes **confirmed / payment pending / payment failed / cancelled / not found** from the order's real state (`lib/order-status.ts#orderHeadline`).
* One status vocabulary: `lib/order-status.ts` feeds the API tracking copy, the storefront and the admin badges; the six state machines are kept separate.
* Staff moves: illegal transitions → 409; `SHIPPED` needs a shipment or a note documenting manual fulfilment; `DELIVERED` needs a carrier delivery event or proof-of-delivery note; `CANCELLED` needs a reason. Payment status cannot be edited by staff.
* Customers get 404 (not 403) for orders that are not theirs.

## Still awaiting credentials / not built
* **Online payment (UPI/card)**: the checkout shows it disabled. The mock provider needs a server-side secret to sign proofs, so it cannot complete from a browser by design; Razorpay/Stripe adapters exist server-side but the client SDK launch is not wired and has never run against a live account.
* **Email / SMS / WhatsApp**: events fire into the existing outbox with the console provider; register a real provider with `registerProvider()` (SES/Twilio/etc.). In-app notifications work. No delivery is claimed unless a provider confirms it.
* **Real carrier tracking feeds**: tracking events are the ones staff/shipment updates persist; no carrier webhook integration exists.
* **Comparison UI** (no compare page existed) and a newsletter endpoint (the fake form was removed).
