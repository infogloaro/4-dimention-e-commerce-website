# Database

PostgreSQL 17 (15+ supported) · Prisma 7.10 (`prisma-client` generator, `@prisma/adapter-pg`) · 4 migrations in `prisma/migrations/`.

```bash
npm run db:up           # start local container (port 5440) — or point DATABASE_URL anywhere
npm run db:migrate      # prisma migrate deploy
npm run db:seed         # roles/permissions/shipping/settings (+ demo data outside production)
```

## Models (65 tables)

| Domain | Models |
|---|---|
| Identity & RBAC | `User`, `Role`, `Permission`, `RolePermission`, `Session`, `VerificationToken`, `Address` |
| Catalog | `Product`, `ProductVariant`, `VariantOptionValue`, `Attribute`, `ProductAttributeValue`, `CategoryAttribute`, `Category`, `Brand`, `Collection`, `CollectionProduct`, `Tag`, `ProductTag`, `ProductMedia`, `ProductRelation`, `SearchSynonym`, `SearchLog` |
| Inventory | `Inventory`, `StockMovement`, `StockReservation`, `StockReceipt`, `StockReceiptItem` |
| Commerce | `Cart`, `CartItem`, `WishlistItem`, `RecentlyViewed`, `Coupon`, `CouponProduct`, `CouponCategory`, `CouponRedemption` |
| Shipping | `ShippingZone`, `ShippingMethod`, `ShippingRate`, `Shipment`, `ShipmentItem` |
| Orders | `Order`, `OrderItem`, `OrderStatusHistory`, `TrackingEvent` |
| Payments | `Payment`, `Refund`, `WebhookEvent`, `IdempotencyRecord` |
| Returns | `ReturnRequest`, `ReturnItem` |
| Social | `Review`, `ReviewMedia`, `ReviewVote`, `ProductQuestion`, `ProductAnswer` |
| Notifications | `Notification`, `NotificationDelivery` (outbox) |
| CMS | `ContentBlock`, `HomeSection`, `StoreSetting` |
| Support | `SupportTicket`, `TicketMessage` |
| Ops | `AuditLog`, `DailySalesStat` (analytics rollup) |

## Key design choices

* **Dynamic variants.** Nothing is hard-coded: `Attribute` (key `color`, `storage`, `size`, …) + `VariantOptionValue` define a variant's axes; `ProductAttributeValue` stores specifications. Any new attribute is created on the fly by the admin product API. Filterable attributes feed storefront facets automatically.
* **Every product has ≥ 1 variant.** Price, MRP (`compareAtPrice`), SKU, weight, tax override and stock live on the variant. Simple products have one default variant. "Sale pricing" = `price < compareAtPrice`; time-boxed promotions are done with coupons/collections rather than scheduled price flips (which would make the denormalised price range stale).
* **Denormalised read-model on `Product`** (`minPrice`, `maxPrice`, `maxDiscountPct`, `inStock`, `ratingAvg/Count/Breakdown`, `soldCount`, `viewCount`, `searchText`) powers fast filtering/sorting/facets with plain indexes. It is recomputed in the same transaction as every write that can change it (`reindexProduct`, `refreshStockFlags`, `recomputeRating`).
* **Orders are immutable snapshots.** `OrderItem` copies name, variant, SKU, image, attributes, unit price, MRP, tax rate/amount, discount share; `Order` copies addresses, shipping method, coupon and the full pricing breakdown. Product edits/deletes never alter history (tested).
* **Hierarchical categories** use a materialised `path` (`electronics/phones`) + `depth`; moving a node recomputes its subtree and reindexes affected products. The whole tree is one cached query.

## Constraints enforced by the database itself (hand-written SQL in the init migration)

* `Inventory`: `quantity >= 0`, `reserved >= 0`, `reserved <= quantity` (unless backorder) — **stock cannot go negative even if application code is wrong** (tested by raw `UPDATE`).
* `Order`/`OrderItem`/`Refund`/`Payment`/`Coupon`/`Review`/`CartItem`/`ProductVariant` sanity checks (non-negative totals, `refundedTotal <= grandTotal`, rating 1–5, percent 1–100, `compareAtPrice >= price`, returned+cancelled ≤ quantity …).
* Partial unique indexes: one default address per user, one default variant per product, one primary image per product, one cart per user.

## Indexes

Every hot query path has an index: user email/phone (unique), product slug (unique) + `(status, deletedAt, categoryId|brandId|createdAt|minPrice|soldCount|ratingAvg)`, partial index for active listings, variant SKU (unique) + trigram, category slug/parent/path, order number (unique), `(userId, createdAt)`, `(status, createdAt)`, `paymentStatus`, `reservationExpiresAt`, inventory `(quantity, reserved)`, `StockMovement (variantId, createdAt)`, review `(productId, status, createdAt)`, coupon code (unique) + `(isActive, startsAt, endsAt)`, tracking `(orderId, occurredAt)`, audit `(resourceType, resourceId)`/`(actorId, createdAt)`/`(action, createdAt)`, partial index on active reservations and active sessions.

**Search** uses `pg_trgm` GIN indexes on `Product.searchText` and `ProductVariant.sku` (substring + typo tolerance via `word_similarity`, threshold lowered to 0.45 per query) and a `tsvector` GIN index for future ranked full-text.

## Migrations

| Migration | Why |
|---|---|
| `…_init` | full schema + custom SQL (extensions, CHECKs, partial/trigram indexes) |
| `…_coupon_stacking` | carts/orders hold a *list* of coupon codes |
| `…_public_coupons_invoice_limits` | `Coupon.isPublic`, `Order.invoiceNumber`, `Product.maxQuantityPerOrder` |
| `…_cart_user_unique` | Prisma-managed unique on `Cart.userId` |

> Hand-written migration files must be saved **without a UTF-8 BOM** (a BOM made `prisma migrate deploy` hang on Windows).

## Seed

`npm run db:seed` always ensures roles, permissions, shipping zones/methods/rates and store settings (safe for production). Outside production it also creates 7 staff + 5 customers (**development-only credentials from `SEED_*` env vars**), 5 root + 11 child categories, 10 brands, 26 products (133 variants with realistic specs/stock), collections, 5 coupons, CMS hero/promo blocks, home sections, search synonyms, and — through the *real* checkout/payment/fulfilment services — 5 orders in different states plus verified reviews. It refuses to create demo accounts when `NODE_ENV=production`.
