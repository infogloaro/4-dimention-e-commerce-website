import { env } from "../../core/env";
import { AppError } from "../../core/errors";
import { hmacHex, randomToken, safeEqual } from "../../core/crypto";
import type { PaymentProvider, ProviderWebhookEvent } from "./types";

/**
 * Credential-free provider for development and automated tests (refused in production by env validation).
 * Client proof = { outcome: "success" | "failure", signature: HMAC(secret, `${providerPaymentId}:${outcome}`) }.
 * Webhooks are signed with HMAC-SHA256(secret, rawBody) in the `x-mock-signature` header — the same verification
 * discipline as real providers, so webhook handling is genuinely exercised by tests.
 */
const secret = () => env.PAYMENT_WEBHOOK_SECRET || "dev-webhook-secret";

export const mockSign = (providerPaymentId: string, outcome: "success" | "failure") => hmacHex(secret(), `${providerPaymentId}:${outcome}`);
export const mockSignBody = (rawBody: string) => hmacHex(secret(), rawBody);

export const mockProvider: PaymentProvider = {
  key: "MOCK",

  async createPayment(input) {
    const providerPaymentId = `mock_pay_${randomToken(9)}`;
    return {
      providerPaymentId,
      status: "REQUIRES_ACTION",
      clientPayload: { provider: "mock", paymentRef: providerPaymentId, amount: input.amount, currency: input.currency, orderNumber: input.orderNumber },
    };
  },

  async verifyPayment({ providerPaymentId, payload }) {
    const outcome = payload.outcome === "success" ? "success" : "failure";
    const sig = typeof payload.signature === "string" ? payload.signature : "";
    if (!sig || !safeEqual(sig, mockSign(providerPaymentId, outcome))) {
      throw new AppError("PAYMENT_SIGNATURE_INVALID", "Payment proof signature is invalid");
    }
    return outcome === "success"
      ? { status: "CAPTURED", providerChargeId: `mock_chg_${providerPaymentId.slice(9)}`, method: "mock_card" }
      : { status: "FAILED", failureCode: "mock_declined", failureReason: "The mock payment was declined" };
  },

  async capturePayment({ providerPaymentId }) {
    return { status: "CAPTURED", providerChargeId: `mock_chg_${providerPaymentId.slice(9)}` };
  },

  async refundPayment({ idempotencyKey }) {
    return { providerRefundId: `mock_rf_${idempotencyKey.slice(-12)}`, status: "SUCCEEDED" };
  },

  async handleWebhook({ rawBody, headers }) {
    const sig = headers.get("x-mock-signature") ?? "";
    if (!sig || !safeEqual(sig, mockSignBody(rawBody))) throw new AppError("WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature");
    const body = JSON.parse(rawBody) as { id: string; type: string; paymentId?: string; chargeId?: string; refundId?: string; amount?: number; reason?: string };
    const map: Record<string, ProviderWebhookEvent["type"]> = { "payment.captured": "payment.captured", "payment.failed": "payment.failed", "refund.processed": "refund.processed", "refund.failed": "refund.failed" };
    return { eventId: body.id, type: map[body.type] ?? "ignored", providerPaymentId: body.paymentId, providerChargeId: body.chargeId, providerRefundId: body.refundId, amount: body.amount, failureReason: body.reason, raw: body };
  },
};
