import { env } from "../../core/env";
import { AppError } from "../../core/errors";
import { hmacHex, safeEqual } from "../../core/crypto";
import type { PaymentProvider } from "./types";

/**
 * Razorpay adapter (REST, no SDK dependency). Requires RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET.
 * NOTE: written against Razorpay's public API docs; it has not been exercised against a live account in this repo.
 */
const API = "https://api.razorpay.com/v1";

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new AppError("PAYMENT_PROVIDER_UNAVAILABLE", "Razorpay credentials are not configured");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Payout-Idempotency": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string; code?: string } };
  if (!res.ok) throw new AppError("PAYMENT_FAILED", json.error?.description ?? "Razorpay request failed", { providerCode: json.error?.code });
  return json;
}

export const razorpayProvider: PaymentProvider = {
  key: "RAZORPAY",

  async createPayment(input) {
    const order = await call<{ id: string }>("POST", "/orders", { amount: input.amount, currency: input.currency, receipt: input.orderNumber, notes: { orderId: input.orderId } });
    return { providerPaymentId: order.id, status: "REQUIRES_ACTION", clientPayload: { provider: "razorpay", keyId: env.RAZORPAY_KEY_ID, razorpayOrderId: order.id, amount: input.amount, currency: input.currency, prefill: { name: input.customer.name, email: input.customer.email, contact: input.customer.phone ?? undefined } } };
  },

  async verifyPayment({ providerPaymentId, payload }) {
    const paymentId = String(payload.razorpay_payment_id ?? "");
    const signature = String(payload.razorpay_signature ?? "");
    const expected = hmacHex(env.RAZORPAY_KEY_SECRET, `${providerPaymentId}|${paymentId}`);
    if (!paymentId || !signature || !safeEqual(signature, expected)) throw new AppError("PAYMENT_SIGNATURE_INVALID", "Payment signature is invalid");
    const p = await call<{ status: string; method?: string; error_description?: string }>("GET", `/payments/${paymentId}`);
    if (p.status === "captured") return { status: "CAPTURED", providerChargeId: paymentId, method: p.method };
    if (p.status === "authorized") return { status: "AUTHORIZED", providerChargeId: paymentId, method: p.method };
    if (p.status === "failed") return { status: "FAILED", failureReason: p.error_description };
    return { status: "PENDING", providerChargeId: paymentId };
  },

  async capturePayment({ providerPaymentId, amount, currency }) {
    const p = await call<{ status: string }>("POST", `/payments/${providerPaymentId}/capture`, { amount, currency });
    return p.status === "captured" ? { status: "CAPTURED", providerChargeId: providerPaymentId } : { status: "FAILED", failureReason: "Capture failed" };
  },

  async refundPayment({ providerChargeId, amount, idempotencyKey, reason }) {
    if (!providerChargeId) throw new AppError("REFUND_NOT_ALLOWED", "No captured payment to refund");
    const r = await call<{ id: string; status: string }>("POST", `/payments/${providerChargeId}/refund`, { amount, notes: { reason, idempotencyKey } }, idempotencyKey);
    return { providerRefundId: r.id, status: r.status === "processed" ? "SUCCEEDED" : "PROCESSING" };
  },

  async handleWebhook({ rawBody, headers }) {
    const sig = headers.get("x-razorpay-signature") ?? "";
    if (!env.RAZORPAY_WEBHOOK_SECRET || !sig || !safeEqual(sig, hmacHex(env.RAZORPAY_WEBHOOK_SECRET, rawBody))) throw new AppError("WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature");
    const body = JSON.parse(rawBody) as { event: string; payload?: { payment?: { entity?: { id: string; order_id: string; method?: string; amount?: number; error_description?: string } }; refund?: { entity?: { id: string; payment_id: string; amount?: number } } } };
    const eventId = headers.get("x-razorpay-event-id") ?? hmacHex("evt", rawBody);
    const pay = body.payload?.payment?.entity;
    const refund = body.payload?.refund?.entity;
    switch (body.event) {
      case "payment.captured":
        return { eventId, type: "payment.captured", providerPaymentId: pay?.order_id, providerChargeId: pay?.id, method: pay?.method, amount: pay?.amount, raw: body };
      case "payment.failed":
        return { eventId, type: "payment.failed", providerPaymentId: pay?.order_id, providerChargeId: pay?.id, failureReason: pay?.error_description, raw: body };
      case "refund.processed":
        return { eventId, type: "refund.processed", providerChargeId: refund?.payment_id, providerRefundId: refund?.id, amount: refund?.amount, raw: body };
      case "refund.failed":
        return { eventId, type: "refund.failed", providerChargeId: refund?.payment_id, providerRefundId: refund?.id, raw: body };
      default:
        return { eventId, type: "ignored", raw: body };
    }
  },
};
