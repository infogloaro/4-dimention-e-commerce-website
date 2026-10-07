import { env } from "../../core/env";
import { AppError } from "../../core/errors";
import { hmacHex, safeEqual } from "../../core/crypto";
import type { PaymentProvider } from "./types";

/**
 * Stripe adapter (PaymentIntents over REST). Requires STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET.
 * NOTE: written against Stripe's public API docs; not exercised against a live account in this repo.
 * Client proof: { paymentIntentId } — the server re-reads the intent from Stripe, so the client cannot assert success.
 */
const API = "https://api.stripe.com/v1";
const TOLERANCE_SEC = 300;

async function call<T>(method: "GET" | "POST", path: string, form?: Record<string, string | number | undefined>, idempotencyKey?: string): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new AppError("PAYMENT_PROVIDER_UNAVAILABLE", "Stripe credentials are not configured");
  const body = form ? new URLSearchParams(Object.entries(form).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])) : undefined;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: string } };
  if (!res.ok) throw new AppError("PAYMENT_FAILED", json.error?.message ?? "Stripe request failed", { providerCode: json.error?.code });
  return json;
}

export const stripeProvider: PaymentProvider = {
  key: "STRIPE",

  async createPayment(input) {
    const pi = await call<{ id: string; client_secret: string }>("POST", "/payment_intents", { amount: input.amount, currency: input.currency.toLowerCase(), "metadata[orderId]": input.orderId, "metadata[orderNumber]": input.orderNumber, receipt_email: input.customer.email, "automatic_payment_methods[enabled]": "true" }, input.idempotencyKey);
    return { providerPaymentId: pi.id, status: "REQUIRES_ACTION", clientPayload: { provider: "stripe", clientSecret: pi.client_secret, paymentIntentId: pi.id } };
  },

  async verifyPayment({ providerPaymentId }) {
    const pi = await call<{ status: string; latest_charge?: string; last_payment_error?: { message?: string; code?: string } }>("GET", `/payment_intents/${providerPaymentId}`);
    if (pi.status === "succeeded") return { status: "CAPTURED", providerChargeId: pi.latest_charge };
    if (pi.status === "requires_capture") return { status: "AUTHORIZED", providerChargeId: pi.latest_charge };
    if (pi.status === "canceled" || pi.last_payment_error) return { status: "FAILED", failureCode: pi.last_payment_error?.code, failureReason: pi.last_payment_error?.message };
    return { status: "PENDING" };
  },

  async capturePayment({ providerPaymentId, amount }) {
    const pi = await call<{ status: string; latest_charge?: string }>("POST", `/payment_intents/${providerPaymentId}/capture`, { amount_to_capture: amount });
    return pi.status === "succeeded" ? { status: "CAPTURED", providerChargeId: pi.latest_charge } : { status: "FAILED", failureReason: "Capture failed" };
  },

  async refundPayment({ providerPaymentId, amount, idempotencyKey, reason }) {
    const r = await call<{ id: string; status: string; failure_reason?: string }>("POST", "/refunds", { payment_intent: providerPaymentId, amount, "metadata[reason]": reason }, idempotencyKey);
    if (r.status === "failed") return { providerRefundId: r.id, status: "FAILED", failureReason: r.failure_reason };
    return { providerRefundId: r.id, status: r.status === "succeeded" ? "SUCCEEDED" : "PROCESSING" };
  },

  async handleWebhook({ rawBody, headers }) {
    const header = headers.get("stripe-signature") ?? "";
    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
    const t = Number(parts.t);
    if (!env.STRIPE_WEBHOOK_SECRET || !parts.v1 || !t || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SEC || !safeEqual(parts.v1, hmacHex(env.STRIPE_WEBHOOK_SECRET, `${t}.${rawBody}`))) {
      throw new AppError("WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature");
    }
    const evt = JSON.parse(rawBody) as { id: string; type: string; data: { object: { id: string; payment_intent?: string; latest_charge?: string; amount?: number; amount_received?: number; last_payment_error?: { message?: string } } } };
    const o = evt.data.object;
    switch (evt.type) {
      case "payment_intent.succeeded":
        return { eventId: evt.id, type: "payment.captured", providerPaymentId: o.id, providerChargeId: o.latest_charge, amount: o.amount_received, raw: evt };
      case "payment_intent.payment_failed":
        return { eventId: evt.id, type: "payment.failed", providerPaymentId: o.id, failureReason: o.last_payment_error?.message, raw: evt };
      case "refund.updated":
      case "charge.refunded":
        return { eventId: evt.id, type: "refund.processed", providerPaymentId: o.payment_intent, providerRefundId: o.id, amount: o.amount, raw: evt };
      default:
        return { eventId: evt.id, type: "ignored", raw: evt };
    }
  },
};
