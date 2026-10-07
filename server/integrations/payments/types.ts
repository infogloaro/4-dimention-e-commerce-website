import type { PaymentProviderKey } from "../../db/generated/client";

export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  amount: number; // minor units
  currency: string;
  customer: { name: string; email: string; phone?: string | null };
  idempotencyKey: string;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  /** Everything the frontend SDK needs to open the payment UI. MUST NOT contain secrets. */
  clientPayload: Record<string, unknown>;
  status: "CREATED" | "REQUIRES_ACTION";
}

export interface VerifyPaymentInput {
  providerPaymentId: string;
  /** Provider-specific proof sent by the client after the SDK finishes (signature, payment id, ...). */
  payload: Record<string, unknown>;
}

export interface VerifyPaymentResult {
  status: "CAPTURED" | "AUTHORIZED" | "FAILED" | "PENDING";
  providerChargeId?: string;
  method?: string;
  failureCode?: string;
  failureReason?: string;
}

export interface RefundPaymentInput {
  providerPaymentId: string;
  providerChargeId?: string | null;
  amount: number;
  currency: string;
  idempotencyKey: string;
  reason?: string;
}

export interface RefundPaymentResult {
  providerRefundId: string;
  status: "SUCCEEDED" | "PROCESSING" | "FAILED";
  failureReason?: string;
}

/** Normalised webhook event — providers translate their own payloads into this. */
export interface ProviderWebhookEvent {
  eventId: string;
  type: "payment.captured" | "payment.failed" | "refund.processed" | "refund.failed" | "ignored";
  providerPaymentId?: string;
  providerChargeId?: string;
  providerRefundId?: string;
  method?: string;
  amount?: number;
  failureReason?: string;
  raw: unknown;
}

export interface PaymentProvider {
  readonly key: PaymentProviderKey;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  capturePayment(input: { providerPaymentId: string; amount: number; currency: string }): Promise<VerifyPaymentResult>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  /** Must verify the signature against the RAW body and throw AppError(WEBHOOK_SIGNATURE_INVALID) if it fails. */
  handleWebhook(input: { rawBody: string; headers: Headers }): Promise<ProviderWebhookEvent>;
}
