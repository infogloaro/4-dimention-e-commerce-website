# Inventory

`Inventory` (1 row per variant): `quantity` (on hand, incl. reserved), `reserved`, `sold`, `lowStockThreshold`, `allowBackorder`. **available = quantity − reserved.**

## No overselling, by construction
Every change is a single conditional SQL statement, so two buyers racing for the last unit cannot both succeed — one `UPDATE` matches zero rows:

```sql
UPDATE "Inventory" SET reserved = reserved + :n
WHERE "variantId" = :v AND ("allowBackorder" OR quantity - reserved >= :n)
RETURNING quantity, reserved
```
and the database refuses impossible states regardless of application bugs (`CHECK quantity >= 0`, `reserved >= 0`, `reserved <= quantity`).

Lifecycle: **reserve** (checkout, `StockReservation ACTIVE` with expiry) → **commit** on payment/COD (`quantity -= n, reserved -= n, sold += n`) or **release** on cancel/expiry (`reserved -= n`). Each reservation row is *claimed* (`ACTIVE → COMMITTED/RELEASED`) before stock moves, so repeated webhooks/jobs cannot apply twice. Lines are processed in variant-id order to avoid deadlocks; transactions retry on serialization/deadlock errors.

Tested: 1 unit / 2 simultaneous buyers → one `201`, one `409`; 3 units / 10 simultaneous buyers (mixed COD & online) → exactly 3 succeed, 7 get `OUT_OF_STOCK/INSUFFICIENT_STOCK`, stock never negative, ledger balances.

## Ledger
`StockMovement` records every change (`RESTOCK, SALE, RESERVE, RELEASE, ADJUSTMENT, RETURN, DAMAGE, CORRECTION`) with deltas, resulting on-hand/reserved, reason, reference (`order`, `receipt`, `return`, `manual`) and actor — full audit trail. Staff operations (all audited):
* `POST /admin/inventory/adjust` — signed delta + mandatory reason; cannot drop on-hand below reserved units (`INVALID_STOCK_ADJUSTMENT`).
* `POST /admin/inventory/receive` — supplier receipt (`StockReceipt` with unique `reference`: double-submit → `409`, so stock can't be double-counted).
* `GET /admin/inventory`, `/movements`, `/low-stock`; `PATCH /admin/inventory/:variantId` (threshold, backorder).

## Expiry & maintenance
`expireStaleReservations()` cancels `PENDING_PAYMENT` orders whose reservation lapsed, releasing stock and coupons; idempotent. Run it on a schedule via `POST /api/v1/jobs/maintenance` (Bearer `JOBS_TOKEN`) — also refreshes analytics and purges expired sessions/tokens/idempotency keys.

## Storefront signals
Per variant: `availability{status: IN_STOCK|LOW_STOCK|OUT_OF_STOCK, available, maxPurchasable, lowStock, message}`. `Product.inStock` is a denormalised flag kept in sync inside the same transactions (powers the in-stock filter and badges).
