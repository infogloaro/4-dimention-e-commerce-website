# Payments

## Provider abstraction (`server/integrations/payments`)
```ts
interface PaymentProvider {
  key: "MOCK" | "RAZORPAY" | "STRIPE" | …
  createPayment(input)   → { providerPaymentId, clientPayload (no secrets), status }
  verifyPayment(input)   → CAPTURED | AUTHORIZED | FAILED | PENDING   // server-side proof check
  capturePayment(input)
  refundPayment(input)   → { providerRefundId, status }                // idempotent by key
  handleWebhook(input)   → normalised event; THROWS on bad signature
}
```
Business code only talks to this interface and `activeOnlineProvider()` (`PAYMENT_PROVIDER` env). Cash on delivery needs no provider: the `Payment` row is `COD`, captured when the order is delivered.

| Provider | Status |
|---|---|
| `mock` | complete; credential-free; used by tests/dev. **Refused in production** by env validation. Client proof = HMAC(`providerPaymentId:outcome`); webhooks signed HMAC-SHA256 over the raw body — the same verification discipline as real gateways. |
| `razorpay` | complete adapter (orders API, signature verify `HMAC(order_id|payment_id)`, capture, refund, webhook `x-razorpay-signature`). **Implemented from the public docs; not run against a live account here** — needs `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`. |
| `stripe` | complete adapter (PaymentIntents, re-reads the intent server-side, refunds, `Stripe-Signature` with 5-min tolerance). **Not run against a live account here** — needs `STRIPE_SECRET_KEY/WEBHOOK_SECRET`. |

## Flow (ONLINE)
```
checkout/create → Order PENDING_PAYMENT + Payment(REQUIRES_ACTION, clientPayload)
client SDK pays → POST /payments/confirm { paymentId, providerPayload }
server: provider.verifyPayment (signature / re-read from provider) → applyPaymentResult()
        └ CAPTURED → payment CAPTURED, order PLACED, stock committed, cart cleared, notifications
        └ FAILED   → payment FAILED, order stays PENDING_PAYMENT (retry allowed)  → POST /orders/:id/pay
provider → POST /payments/webhooks/:provider  (independent confirmation / source of truth for async methods)
```
`/payments/confirm` returns `outcome: SUCCESS | FAILED_CAN_RETRY | PENDING` — the UI must **only** show "order placed" on `SUCCESS`, never because the client SDK said so. States the UI should model: idle → validating → processing → success / failed / retry / cancelled / pending.

## Safety properties (all covered by tests)
* **One state-change function** (`applyPaymentResult`) serves both the client confirmation and webhooks: it row-locks the payment (`SELECT … FOR UPDATE`), treats `CAPTURED` as terminal, and finalises the order once. Webhook-then-confirm, confirm-then-webhook, parallel double-confirm, redelivered events with new ids → exactly one placement, stock committed once.
* **Webhooks**: signature checked on the *raw* body before parsing (`401 WEBHOOK_SIGNATURE_INVALID`); `WebhookEvent (provider,eventId)` unique → duplicates acknowledged as `duplicate`; a crashed earlier attempt is reprocessed (handlers are idempotent); handler failure returns 500 so the provider retries; unknown payments are `ignored`.
* **Amount check**: a captured amount ≠ order total never places the order (`amount_mismatch`, audited).
* A failed event never downgrades a captured payment.
* **Late money**: capture arriving for an order already cancelled/expired is recorded and **auto-refunded** (`late-capture:<paymentId>` key).
* Customers can only confirm *their own* payments (cross-user → 404).

## Refunds (`server/services/refunds.ts`)
`refundOrder({orderId, amount?, reason, idempotencyKey})`: row-locks the order, **reserves** the amount (`refundedTotal += amount`, DB CHECK `≤ grandTotal`) before calling the provider, then calls it; provider failure releases the reservation. Same key → same refund. Two racing refunds that together exceed the paid amount → one `201`, one `422 REFUND_EXCEEDS_PAID` (tested). Provider-async refunds finish via `refund.processed` webhook. **COD** refunds are manual: created `PENDING`, confirmed with `POST /admin/refunds/:id/process`. Partial refunds supported (`paymentStatus: PARTIALLY_REFUNDED → REFUNDED`).
Automatic refunds: cancelling a paid order, a received return, late captures.

## Adding a provider
Implement `PaymentProvider`, call `registerPaymentProvider()`, add its key to `PaymentProviderKey` (Prisma enum + migration) and `providerKeyFromSlug`. No order/checkout code changes.
