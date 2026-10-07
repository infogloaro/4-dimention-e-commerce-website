# Checkout

Checkout requires an **account** (guest carts merge on login). This keeps coupons per-user, tracking, reviews and returns attributable; it can be relaxed later by adding a guest identity to `Order`.

## Calls
| Step | Endpoint | Notes |
|---|---|---|
| Dry run | `POST /checkout/validate` | creates/reserves nothing. Returns `valid`, `items[]` (with issues), `pricing`, `shipping{selected,options[]}`, `coupons{applied,rejected}`, `paymentMethods[]`, `reservationMinutes`. Call whenever address / delivery option / coupon changes. |
| Place | `POST /checkout/create` + **`Idempotency-Key`** header | body: `addressId`, `paymentMethod: COD\|ONLINE`, optional `shippingMethod`, `billingAddressId`, `notes`, `couponCodes`, `expectedTotal`, `items[]` (buy-now; otherwise the cart is used) |

Response `201`: `{ order (full view), payment | null, nextAction: "COMPLETE_PAYMENT" | "ORDER_CONFIRMED", reservationExpiresAt }`.

## What happens inside (one DB transaction, `server/services/checkout.ts`)
1. `pg_advisory_xact_lock` on the customer → their concurrent checkouts serialise (per-user coupon limits can't be raced).
2. Any earlier **unpaid** order of this customer is cancelled/released ("superseded") so abandoned attempts never hoard stock.
3. Re-load address (must belong to the user), re-price from the database (same engine as the cart), validate every line: product live, variant active, stock, per-order max, shipping serviceable, coupon valid. Any problem → typed error, **nothing written** (`ITEM_UNAVAILABLE`, `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `MAX_QUANTITY_EXCEEDED`, `SHIPPING_UNAVAILABLE`, `COUPON_*`, `CART_EMPTY`).
4. `expectedTotal` (optional) mismatch → `PRICE_CHANGED {expectedTotal, actualTotal}` so the UI can re-confirm instead of silently charging more.
5. Create `Order` (`PENDING_PAYMENT`, order number `4D-YYMMDD-XXXXXX`) with immutable snapshots, items, status history and tracking events.
6. **Reserve stock** atomically per variant (`UPDATE … WHERE quantity - reserved >= n`) — see [INVENTORY.md](INVENTORY.md).
7. Claim coupon uses atomically; write per-user redemptions.
8. **COD** (or a ₹0 order): immediately `PLACED`, reservation committed → stock sold, cart lines cleared. **ONLINE**: stays `PENDING_PAYMENT` with a reservation window (`STOCK_RESERVATION_MINUTES`, default 15).
9. After commit (ONLINE only): create the payment attempt with the provider. If the provider call fails the order is cancelled and stock released (compensation) and the idempotency record is dropped so the client can retry.
10. Notifications (`order.placed`) are best-effort and never fail an order.

## Idempotency
* Same key + same body → the stored response is replayed (`Idempotent-Replay: true`); nothing is created twice.
* Same key + different body → `422 IDEMPOTENCY_KEY_REUSED`.
* Same key while the first request is still running → `409 REQUEST_IN_PROGRESS`.
* A failed attempt releases its key so a retry works. Keys live 24 h. Missing/malformed key → `400`.
* The frontend should generate one UUID per "Place order" intent and reuse it on retries/double-clicks.

## Tax & shipping
`STORE_PRICES_INCLUDE_TAX=true` (default, India/GST style): prices are tax-inclusive; tax is *extracted* per line (`round(net × r / (1+r))`) and shown on the invoice. With `false`, tax is added on top. Rate: `Product.taxRateBps` (variant override possible). Shipping: zone match (postal prefix > state > country > default) → method rate = base + per-extra-kg; free above a per-rate threshold (evaluated on the **discounted** subtotal) or via a `FREE_SHIPPING` coupon. Shipping itself is not taxed (documented simplification).

## Delivery estimate
Each shipping option carries `minDays/maxDays` and `estimatedDelivery{earliest,latest}`; the order stores `estimatedDeliveryMin/Max`.
