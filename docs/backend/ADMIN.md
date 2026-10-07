# Admin backend

All routes are under `/api/v1/admin/**`, each guarded by an explicit permission ([RBAC.md](RBAC.md)), rate-limited (600/min), and every mutation writes an audit entry. List endpoints are paginated (`page`, `pageSize ≤ 100`) with the standard `meta`.

| Area | Endpoints (see [API.md](API.md) for the full list) |
|---|---|
| **Dashboard** | `GET /dashboard` — KPIs (revenue/orders today, 7 d, 30 d, AOV, change vs previous period, refunds), customer totals/new/repeat rate, product counts, order counts by status (`pending, awaitingPayment, toShip, inTransit`), alerts (open returns, pending refunds, low-stock), 30-day sales trend, top products, low-stock list, recent orders, funnel. Cached 30 s. |
| **Analytics** | `GET /analytics/sales?from&to&granularity=day\|week\|month` (series, totals, AOV, new customers, **comparison with the previous equal-length window**), `/analytics/products` (top products + category performance), `/analytics/customers` (totals, new, repeat rate, top customers, **funnel**: carts → checkouts started → orders placed). Range ≤ 400 days. |
| **Products** | list/search/filter by status & category (includes drafts), detail, create (variants + media + specs + stock in one call), `PATCH`, soft-`DELETE`, `POST /bulk`, variants `POST/PATCH/DELETE`, media via `/media/sign` (S3/Cloudinary direct upload) or `/media/upload` (local) |
| **Taxonomy** | categories (tree, create, move with cycle protection, reorder, delete only when empty), brands, collections (with product lists, schedule windows) |
| **Inventory** | stock list with low-stock filter, adjust, receive, movement history, thresholds/backorder ([INVENTORY.md](INVENTORY.md)) |
| **Orders** | search (number, email, name, phone) + filter (status, payment, date, customer), detail with `allowedTransitions`, status change, shipments, carrier updates, custom tracking events, refunds (idempotent), offline-refund confirmation |
| **Returns** | list, approve/reject (+pickup), advance to picked-up / received (restock + refund) |
| **Customers** | search/filter/sort (newest, spend, orders), profile (addresses, counts, AOV, recent orders), suspend/ban/reactivate (kills sessions) |
| **Coupons** | CRUD, activate/deactivate (`PATCH {isActive}`), per-coupon analytics (uses, total discount, revenue influenced, unique users, remaining), delete keeps history by deactivating when redeemed |
| **Reviews & Q&A** | list by status/product, approve/reject (recomputes product rating), moderate questions, official answers |
| **Content / CMS** | banners/hero/promo/campaign/announcement blocks (placement, media, CTA, schedule window, order), home sections (type + JSON config, order), `PATCH` bulk reorder |
| **Support** | list/filter tickets, reply (notifies customer), change status |
| **Settings** | key/value store settings (`isPublic` ones are served at `/settings/public`), e.g. `store.profile` used on invoices |
| **Users / roles** | staff list/create, change role, role list, edit role permissions (super admin) |
| **Audit** | `GET /audit-logs` filter by actor, action prefix, resource, date |

## Audit log
`AuditLog{actorId, actorRole, action, resourceType, resourceId, ip, userAgent, requestId, metadata, createdAt}`. Written **inside the same transaction** as the change it describes wherever one exists (so a rollback leaves no phantom entry). Recorded actions include: `auth.registered|login|logout|account_locked|password_*`, `product.created|updated|status_changed|price_changed|deleted|bulk_*`, `variant.*`, `inventory.adjusted|received|settings_changed`, `order.created|status_changed|cancelled`, `shipment.*`, `refund.requested|issued|processed`, `return.*`, `customer.status_changed`, `user.staff_created|role_changed`, `role.permissions_changed`, `coupon.*`, `category|brand|collection.*`, `content.*`, `review.approved|rejected`, `settings.updated`, `media.uploaded`, `payment.amount_mismatch|late_capture`.

## Analytics design
`DailySalesStat` is a per-day rollup (orders, items, revenue, discounts, shipping, tax, refunds, cancellations, new customers) computed with one set-based `INSERT … SELECT … ON CONFLICT` statement. Closed days are computed once; today/yesterday refresh at most every 60 s (so "today" can lag up to a minute); the maintenance job refreshes them too. Days are **UTC** — if you need a store-local day boundary, change the `AT TIME ZONE` in `analytics.ts`.

## Not exposed through the API (deliberate scope limits)
Shipping zones/methods/rates are seeded and editable in the database but have no admin CRUD endpoints yet; no endpoint sends *promotional* notifications (the `promo.generic` template and the `notification:manage` permission exist); attribute definitions are created implicitly by product writes and there is no screen-oriented attribute/category-attribute management API.
