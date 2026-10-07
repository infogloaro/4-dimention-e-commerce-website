# Cart, wishlist, addresses

## Identity
* **Signed-in**: one cart per user (DB-unique).
* **Guest**: first `POST /cart/items` creates a cart and sets an `HttpOnly` cookie `fourd_cart`; only a **hash** of the token is stored. Guest carts expire after 30 days.
* **Merge**: on login/register (or `POST /cart/merge`) guest lines are summed into the user's cart (cap 100 per line), saved-for-later flags and coupon codes carry over, and the guest cart is deleted. Idempotent.

## Server-side truth
Every cart read runs the same code path as checkout (`priceItems` → pure `calculatePricing`). Request bodies carry only `variantId` + `quantity`; any client "price" is ignored. The cart returns, per line: current `unitPrice`, `compareAtPrice`, `lineSubtotal`, `discount`, `tax`, `lineTotal`, `savings`, `availability{status,available,maxPurchasable}`, `issues[]`, and `priceChanged{from,to}` when the price moved since the item was added (the **current** price is always the one charged).

`pricing`: `subtotal, mrpTotal, mrpSavings, couponDiscount, discountedSubtotal, shippingFee, shippingDiscount, shippingTotal, taxTotal, grandTotal, totalSavings, freeShippingRemaining, itemCount, appliedCoupons[], rejectedCoupons[]`.
`shipping`: `selected` (delivery estimate), `options[]`, `serviceable`. Pass `?postalCode=` or `?addressId=` to price shipping for a destination.

## Operations
`GET /cart` · `POST /cart/items {variantId, quantity}` (accumulates; validates stock, per-order limit, availability) · `PATCH /cart/items/:id {quantity | savedForLater}` (`quantity:0` removes) · `DELETE /cart/items/:id` · `DELETE /cart` · `POST|DELETE /cart/coupon {code}`. Mutations return the full recomputed cart so TanStack Query can set the cache directly.

Errors: `OUT_OF_STOCK`, `INSUFFICIENT_STOCK {available}`, `MAX_QUANTITY_EXCEEDED`, `ITEM_UNAVAILABLE`, `VARIANT_NOT_FOUND`, `CART_ITEM_NOT_FOUND`, `COUPON_*`. Items that sell out or get unpublished after being added are **kept but flagged** (`purchasable:false`) and excluded from totals.

## Coupons
Validated against: active flag, start/end, global usage limit, **per-user limit**, user-restricted, first-order-only (needs sign-in), then in the pricing engine: minimum subtotal, product/category scope (including subcategories), max discount cap, stacking (`isStackable` must hold for **every** coupon in the stack; later coupons apply to the remaining amount). Types: percentage, fixed, free shipping. At checkout the use is claimed with an atomic `UPDATE … WHERE usedCount < usageLimit` and returned if the order is cancelled/expires.

## Wishlist (`/wishlist`)
Add (idempotent), remove, list with `availability` and `priceChange{from,to,dropped}` since it was added, `?idsOnly=true` for heart-icon state, `POST /wishlist/:productId/move-to-cart`.

## Addresses (`/addresses`)
Create/update/delete (soft)/`POST :id/default`; max 20; first address becomes default; exactly one default (DB-enforced); phone normalised to E.164-ish; postal code validated; `country` ISO-2.
