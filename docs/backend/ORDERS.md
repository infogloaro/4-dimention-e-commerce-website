# Orders, tracking, returns

## State machine (`server/domain/order-state.ts`)
```
PENDING_PAYMENT → PLACED → CONFIRMED → PROCESSING → PACKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED
      ↓ ↘ FAILED       ↘ every state up to PACKED can → CANCELLED                    SHIPPED → DELIVERED (skip allowed)
                                            DELIVERED → RETURN_REQUESTED → RETURNED | DELIVERED (partial / rejected)
```
Terminal: `CANCELLED`, `FAILED`, `RETURNED`. The spec's lifecycle is kept; refund state lives on `paymentStatus` (`UNPAID, PENDING, PAID, FAILED, PARTIALLY_REFUNDED, REFUNDED`) so partial refunds/returns don't need extra order states. Illegal moves return `409 ORDER_STATE_INVALID {from,to,allowed[]}`. Transitions use `UPDATE … WHERE status = :from`, so concurrent staff clicks can't both win. Every transition writes `OrderStatusHistory` + a `TrackingEvent` and is audited.

Customers may cancel only in `PENDING_PAYMENT, PLACED, CONFIRMED, PROCESSING`. Cancel unwinds: stock released/restocked, `soldCount` reverted, coupon use returned, open payment attempts cancelled, **automatic refund** if paid. Staff can cancel up to `PACKED`.

## Customer API
`GET /orders` (paginated; `status`, `search`) · `GET /orders/:id` (UUID or order number) · `POST /orders/:id/cancel` · `POST /orders/:id/pay` (retry) · `GET /orders/:id/invoice` · `POST /orders/:id/returns` · `GET /tracking/:id`.

`actions` on the order tell the UI what to show: `canCancel, canReturn (+returnWindowEndsAt), canReview, canPay, canDownloadInvoice`. Each item has `returnableQuantity`.

## Tracking (`GET /tracking/:id`)
```jsonc
{ "status": "OUT_FOR_DELIVERY",
  "progress": [ { "status":"PLACED","label":"Order placed","at":"…","state":"completed" }, …,
                { "status":"OUT_FOR_DELIVERY","state":"current" }, { "status":"DELIVERED","state":"upcoming" } ],
  "events":   [ { "code":"REACHED_HUB","title":"Reached hub","description":"…","location":"Pune Hub","occurredAt":"…","metadata":null } ],  // newest first
  "shipments":[ { "carrier":"BlueDart","trackingNumber":"…","status":"…","estimatedDelivery":"…" } ],
  "estimatedDelivery": { "min":"…","max":"…" } }
```
`progress` is **derived from recorded history, never from time**, as the spec demands (state-driven animation). Cancelled orders mark the unreached stages `skipped`. Staff add richer events via `POST /admin/shipments/:id` (carrier statuses such as `REACHED_HUB`) and `POST /admin/orders/:id/tracking` (free-form: title, description, location, metadata).

## Shipping
Staff create a shipment with `POST /admin/orders/:id/shipments` (order must be `PACKED`; carrier, tracking number/URL, ETA, partial item lists) → order `SHIPPED`. COD orders capture cash and mark `PAID` on `DELIVERED`.

## Returns & replacements
* `POST /orders/:id/returns { items[{orderItemId,quantity,reason}], reason, details, resolution: REFUND|REPLACEMENT, evidenceUrls }` — **partial** returns; quantity checked against what is left after earlier/pending returns; window = 10 days from delivery (`RETURN_WINDOW_DAYS`).
* Workflow: `REQUESTED → APPROVED/REJECTED → PICKUP_SCHEDULED → PICKED_UP → RECEIVED → REFUND_PENDING → COMPLETED` (customer may cancel before pickup). `GET /returns/:id` returns a `timeline`.
* On `RECEIVED` (one transaction): items restocked (if flagged), `returnedQuantity` and `soldCount` updated, refund of the items' proportional paid value issued (item value only; shipping is not refunded). Online → provider refund; COD → manual refund confirmed by staff. `REPLACEMENT` completes without a refund.
* Order returns to `DELIVERED` while some units remain, becomes `RETURNED` when none do.

## Invoice
`GET /orders/:id/invoice` returns structured data (seller profile from `store.profile` setting, bill-to/ship-to, lines, totals, **tax breakdown by rate** that reconciles to the total). Rendering/PDF is a frontend concern.
