import { db, withTransaction } from "../db/client";
import { env } from "../core/env";
import { AppError, notFound } from "../core/errors";
import { logger } from "../core/logger";
import { activeOnlineProvider, getPaymentProvider, type ProviderWebhookEvent, type VerifyPaymentResult } from "../integrations/payments";
import { finalizePlacement } from "./orders-core";
import { failRefundByProvider, finalizeRefund, refundOrder } from "./refunds";
import { audit } from "./audit";
import { notify } from "./notifications";
import type { Order, Payment, PaymentProviderKey, Prisma } from "../db/generated/client";

export interface PaymentInit {
  id: string;
  provider: PaymentProviderKey;
  status: Payment["status"];
  amount: number;
  currency: string;
  clientPayload: Record<string, unknown>;
}

/** Create a new online payment attempt for a PENDING_PAYMENT order. Safe to call again for retries. */
export async function initiateOnlinePayment(order: Pick<Order, "id" | "orderNumber" | "grandTotal" | "currency" | "customerEmail" | "customerName" | "customerPhone">): Promise<PaymentInit> {
  const provider = activeOnlineProvider();
  const attempt = (await db.payment.count({ where: { orderId: order.id } })) + 1;
  const idempotencyKey = `pay:${order.id}:${attempt}`;
  const created = await provider.createPayment({ orderId: order.id, orderNumber: order.orderNumber, amount: order.grandTotal, currency: order.currency, customer: { name: order.customerName, email: order.customerEmail, phone: order.customerPhone }, idempotencyKey });
  const payment = await db.payment.create({
    data: { orderId: order.id, provider: provider.key, status: created.status, amount: order.grandTotal, currency: order.currency, providerPaymentId: created.providerPaymentId, idempotencyKey, clientPayload: created.clientPayload as Prisma.InputJsonValue },
  });
  await db.order.updateMany({ where: { id: order.id, status: "PENDING_PAYMENT" }, data: { paymentStatus: "PENDING" } });
  return { id: payment.id, provider: payment.provider, status: payment.status, amount: payment.amount, currency: payment.currency, clientPayload: created.clientPayload };
}

type Outcome = { changed: boolean; orderId: string; becamePaid: boolean; lateCapture: boolean };

/**
 * The ONE place a payment's state changes — used by both the client confirmation call and provider webhooks.
 * Row-locks the payment, treats CAPTURED as terminal, and finalises the order exactly once. Replaying either input
 * any number of times produces the same final state and a single order placement.
 */
export async function applyPaymentResult(paymentId: string, result: VerifyPaymentResult, ctx: { amount?: number; source: "client" | "webhook" }): Promise<Outcome> {
  const outcome = await withTransaction(async (tx): Promise<Outcome> => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    if (locked.length === 0) throw notFound("PAYMENT_NOT_FOUND", "Payment");
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const base = { orderId: payment.orderId, becamePaid: false, lateCapture: false };
    if (payment.status === "CAPTURED") return { ...base, changed: false };

    if (result.status === "CAPTURED") {
      if (ctx.amount != null && ctx.amount !== payment.amount) {
        await tx.payment.update({ where: { id: paymentId }, data: { status: "FAILED", failureCode: "amount_mismatch", failureReason: `Provider reported ${ctx.amount}, expected ${payment.amount}` } });
        await audit({ action: "payment.amount_mismatch", resourceType: "payment", resourceId: paymentId, metadata: { expected: payment.amount, got: ctx.amount } }, tx);
        return { ...base, changed: true };
      }
      await tx.payment.update({ where: { id: paymentId }, data: { status: "CAPTURED", paidAt: new Date(), providerChargeId: result.providerChargeId ?? payment.providerChargeId, method: result.method ?? payment.method, failureCode: null, failureReason: null } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
      if (order.status === "PENDING_PAYMENT") {
        const placed = await finalizePlacement(tx, order.id, { paid: true });
        return { ...base, changed: true, becamePaid: placed };
      }
      // money arrived for an order that was cancelled / expired meanwhile → keep the books honest and refund it
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID", paidAt: new Date() } });
      await audit({ action: "payment.late_capture", resourceType: "payment", resourceId: paymentId, metadata: { orderId: order.id, orderStatus: order.status } }, tx);
      return { ...base, changed: true, lateCapture: true };
    }

    if (result.status === "FAILED") {
      await tx.payment.update({ where: { id: paymentId }, data: { status: "FAILED", failureCode: result.failureCode, failureReason: result.failureReason?.slice(0, 300) } });
      await tx.order.updateMany({ where: { id: payment.orderId, status: "PENDING_PAYMENT" }, data: { paymentStatus: "FAILED" } });
      return { ...base, changed: true };
    }
    return { ...base, changed: false };
  });

  if (outcome.lateCapture) {
    await refundOrder({ orderId: outcome.orderId, reason: "Payment received after the order was cancelled", idempotencyKey: `late-capture:${paymentId}` }).catch((e) => logger.error("late-capture refund failed", { paymentId, error: e instanceof Error ? e.message : String(e) }));
  }
  if (outcome.changed) await afterPaymentChange(outcome.orderId, outcome.becamePaid, result.status === "FAILED");
  return outcome;
}

async function afterPaymentChange(orderId: string, becamePaid: boolean, failed: boolean) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  const target = { userId: order.userId, email: order.customerEmail, phone: order.customerPhone };
  if (becamePaid) {
    await notify("order.placed", target, { orderNumber: order.orderNumber, total: order.grandTotal });
    await notify("payment.succeeded", target, { orderNumber: order.orderNumber, amount: order.grandTotal });
  } else if (failed) {
    await notify("payment.failed", target, { orderNumber: order.orderNumber });
  }
}

/** Client says "I finished paying" — we do NOT trust that; the provider is asked to verify. */
export async function confirmPayment(userId: string, input: { paymentId: string; providerPayload: Record<string, unknown> }) {
  const payment = await db.payment.findFirst({ where: { id: input.paymentId, order: { userId } }, include: { order: { select: { id: true, orderNumber: true, status: true, paymentStatus: true } } } });
  if (!payment) throw notFound("PAYMENT_NOT_FOUND", "Payment");
  if (payment.provider === "COD") throw new AppError("PAYMENT_STATE_INVALID", "Cash on delivery orders are paid on delivery");
  if (payment.status !== "CAPTURED") {
    const provider = getPaymentProvider(payment.provider);
    let result = await provider.verifyPayment({ providerPaymentId: payment.providerPaymentId ?? "", payload: input.providerPayload });
    if (result.status === "AUTHORIZED") result = await provider.capturePayment({ providerPaymentId: result.providerChargeId ?? payment.providerPaymentId ?? "", amount: payment.amount, currency: payment.currency });
    await applyPaymentResult(payment.id, result, { source: "client" });
  }
  const fresh = await db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { order: { select: { id: true, orderNumber: true, status: true, paymentStatus: true } } } });
  const paid = fresh.status === "CAPTURED" && fresh.order.status !== "CANCELLED";
  return {
    paymentId: fresh.id,
    paymentStatus: fresh.status,
    failureReason: fresh.failureReason,
    order: fresh.order,
    /** What the UI should do next — never imply an order exists unless it is confirmed. */
    outcome: paid ? "SUCCESS" : fresh.status === "FAILED" ? "FAILED_CAN_RETRY" : "PENDING",
  };
}

/** New attempt for an order still waiting for payment (reservation window is extended once per retry). */
export async function retryPayment(userId: string, orderId: string): Promise<PaymentInit> {
  const order = await db.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw notFound("ORDER_NOT_FOUND", "Order");
  if (order.status !== "PENDING_PAYMENT") throw new AppError("ORDER_STATE_INVALID", "This order is not awaiting payment", { status: order.status });
  if (order.reservationExpiresAt && order.reservationExpiresAt <= new Date()) throw new AppError("ORDER_STATE_INVALID", "This checkout expired. Please start again.", { expired: true });
  const open = await db.payment.findFirst({ where: { orderId, status: { in: ["CREATED", "REQUIRES_ACTION"] } }, orderBy: { createdAt: "desc" } });
  if (open) return { id: open.id, provider: open.provider, status: open.status, amount: open.amount, currency: open.currency, clientPayload: (open.clientPayload ?? {}) as Record<string, unknown> };
  const extend = new Date(Date.now() + env.STOCK_RESERVATION_MINUTES * 60_000);
  await db.$transaction([db.order.update({ where: { id: orderId }, data: { reservationExpiresAt: extend } }), db.stockReservation.updateMany({ where: { orderId, status: "ACTIVE" }, data: { expiresAt: extend } })]);
  return initiateOnlinePayment(order);
}

// ───────────────────────────── webhooks ─────────────────────────────

export async function processWebhook(providerKey: PaymentProviderKey, rawBody: string, headers: Headers): Promise<{ status: "processed" | "duplicate" | "ignored" }> {
  const provider = getPaymentProvider(providerKey);
  const evt: ProviderWebhookEvent = await provider.handleWebhook({ rawBody, headers }); // verifies signature

  let record;
  try {
    record = await db.webhookEvent.create({ data: { provider: providerKey, eventId: evt.eventId, type: evt.type, payload: evt.raw as Prisma.InputJsonValue } });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    const prior = await db.webhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: providerKey, eventId: evt.eventId } } });
    if (prior.status === "PROCESSED" || prior.status === "IGNORED") return { status: "duplicate" };
    record = prior; // earlier attempt crashed midway → process again (handlers are idempotent)
  }

  try {
    const handled = await dispatch(providerKey, evt);
    await db.webhookEvent.update({ where: { id: record.id }, data: { status: handled ? "PROCESSED" : "IGNORED", processedAt: new Date(), error: null } });
    return { status: handled ? "processed" : "ignored" };
  } catch (e) {
    await db.webhookEvent.update({ where: { id: record.id }, data: { status: "FAILED", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) } });
    throw e;
  }
}

async function dispatch(providerKey: PaymentProviderKey, evt: ProviderWebhookEvent): Promise<boolean> {
  switch (evt.type) {
    case "payment.captured":
    case "payment.failed": {
      if (!evt.providerPaymentId) return false;
      const payment = await db.payment.findUnique({ where: { provider_providerPaymentId: { provider: providerKey, providerPaymentId: evt.providerPaymentId } } });
      if (!payment) return false;
      await applyPaymentResult(payment.id, evt.type === "payment.captured" ? { status: "CAPTURED", providerChargeId: evt.providerChargeId, method: evt.method } : { status: "FAILED", failureReason: evt.failureReason }, { amount: evt.type === "payment.captured" ? evt.amount : undefined, source: "webhook" });
      return true;
    }
    case "refund.processed": {
      const refund = evt.providerRefundId ? await db.refund.findFirst({ where: { providerRefundId: evt.providerRefundId } }) : null;
      if (!refund) return false;
      await finalizeRefund(refund.id);
      return true;
    }
    case "refund.failed":
      if (!evt.providerRefundId) return false;
      await failRefundByProvider(evt.providerRefundId, evt.failureReason);
      return true;
    default:
      return false;
  }
}

/** COD: cash collected at delivery. */
export async function captureCodPayment(orderId: string, tx = db) {
  await tx.payment.updateMany({ where: { orderId, provider: "COD", status: { not: "CAPTURED" } }, data: { status: "CAPTURED", paidAt: new Date() } });
  await tx.order.updateMany({ where: { id: orderId, paymentStatus: "UNPAID" }, data: { paymentStatus: "PAID", paidAt: new Date() } });
}
