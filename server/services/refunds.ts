import { db, withTransaction } from "../db/client";
import { AppError, notFound } from "../core/errors";
import { logger } from "../core/logger";
import { getPaymentProvider } from "../integrations/payments";
import { audit } from "./audit";
import { notify } from "./notifications";
import { settleOrderAfterReturn } from "./orders-core";
import type { AuthUser } from "../auth/session";
import type { Refund } from "../db/generated/client";

export interface RefundRequest {
  orderId: string;
  /** Defaults to everything still refundable. */
  amount?: number;
  reason: string;
  actor?: Pick<AuthUser, "id" | "roleKey"> | null;
  returnRequestId?: string;
  /** Same key ⇒ same refund. Never creates a second one. */
  idempotencyKey: string;
}

/**
 * Issue a refund exactly once per idempotency key.
 * The refunded amount is *reserved* on the order inside a row-locked transaction before the provider is called, so two
 * concurrent refunds can never exceed what was paid; a provider failure releases the reservation.
 */
export async function refundOrder(req: RefundRequest): Promise<Refund> {
  const existing = await db.refund.findUnique({ where: { idempotencyKey: req.idempotencyKey } });
  if (existing) return existing;

  let refund: Refund;
  try {
    refund = await withTransaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Order" WHERE id = ${req.orderId} FOR UPDATE`;
      if (rows.length === 0) throw notFound("ORDER_NOT_FOUND", "Order");
      const order = await tx.order.findUniqueOrThrow({ where: { id: req.orderId } });
      if (order.paymentStatus !== "PAID" && order.paymentStatus !== "PARTIALLY_REFUNDED") throw new AppError("REFUND_NOT_ALLOWED", "This order has no captured payment to refund", { paymentStatus: order.paymentStatus });
      const refundable = order.grandTotal - order.refundedTotal;
      const amount = req.amount ?? refundable;
      if (amount <= 0 || amount > refundable) throw new AppError("REFUND_EXCEEDS_PAID", "Refund amount exceeds the refundable balance", { refundable, requested: amount });
      const payment = await tx.payment.findFirst({ where: { orderId: order.id, status: "CAPTURED" }, orderBy: { createdAt: "desc" } });
      if (!payment) throw new AppError("REFUND_NOT_ALLOWED", "No captured payment found for this order");
      await tx.order.update({ where: { id: order.id }, data: { refundedTotal: { increment: amount } } });
      return tx.refund.create({ data: { orderId: order.id, paymentId: payment.id, amount, reason: req.reason, idempotencyKey: req.idempotencyKey, returnRequestId: req.returnRequestId, actorId: req.actor?.id, status: "PENDING" } });
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const dup = await db.refund.findUnique({ where: { idempotencyKey: req.idempotencyKey } });
      if (dup) return dup;
    }
    throw e;
  }

  const payment = await db.payment.findUniqueOrThrow({ where: { id: refund.paymentId! } });
  if (payment.provider === "COD") {
    // Cash was collected by the courier: money goes back out-of-band. Staff confirm with markRefundProcessed().
    await audit({ action: "refund.requested", resourceType: "refund", resourceId: refund.id, actor: req.actor, metadata: { orderId: req.orderId, amount: refund.amount, manual: true } });
    return refund;
  }

  try {
    const res = await getPaymentProvider(payment.provider).refundPayment({ providerPaymentId: payment.providerPaymentId ?? "", providerChargeId: payment.providerChargeId, amount: refund.amount, currency: payment.currency, idempotencyKey: req.idempotencyKey, reason: req.reason });
    if (res.status === "FAILED") throw new AppError("PAYMENT_FAILED", res.failureReason ?? "Provider rejected the refund");
    await db.refund.update({ where: { id: refund.id }, data: { providerRefundId: res.providerRefundId, status: "PROCESSING" } });
    if (res.status === "SUCCEEDED") return (await finalizeRefund(refund.id, { actor: req.actor })) ?? refund;
    return { ...refund, status: "PROCESSING", providerRefundId: res.providerRefundId };
  } catch (e) {
    await failRefund(refund.id, e instanceof Error ? e.message : "Refund failed");
    logger.error("refund failed", { refundId: refund.id, orderId: req.orderId, error: e instanceof Error ? e.message : String(e) });
    throw e instanceof AppError ? e : new AppError("PAYMENT_FAILED", "The payment provider could not process the refund");
  }
}

async function failRefund(refundId: string, reason: string) {
  await withTransaction(async (tx) => {
    const flip = await tx.refund.updateMany({ where: { id: refundId, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "FAILED", failureReason: reason.slice(0, 300) } });
    if (flip.count !== 1) return;
    const r = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    await tx.order.update({ where: { id: r.orderId }, data: { refundedTotal: { decrement: r.amount } } });
  });
}

/** Mark a refund as paid out. Idempotent — only the first call changes anything. */
export async function finalizeRefund(refundId: string, opts: { actor?: Pick<AuthUser, "id" | "roleKey"> | null; providerRefundId?: string } = {}): Promise<Refund | null> {
  const done = await withTransaction(async (tx) => {
    const flip = await tx.refund.updateMany({ where: { id: refundId, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "SUCCEEDED", processedAt: new Date(), ...(opts.providerRefundId ? { providerRefundId: opts.providerRefundId } : {}) } });
    if (flip.count !== 1) return null;
    const r = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    const order = await tx.order.findUniqueOrThrow({ where: { id: r.orderId } });
    const paymentStatus = order.refundedTotal >= order.grandTotal ? "REFUNDED" : "PARTIALLY_REFUNDED";
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus } });
    if (paymentStatus === "REFUNDED" && order.userId) await tx.user.update({ where: { id: order.userId }, data: { lifetimeValue: { decrement: order.grandTotal } } });
    if (r.returnRequestId) {
      await tx.returnRequest.updateMany({ where: { id: r.returnRequestId, status: { in: ["RECEIVED", "REFUND_PENDING"] } }, data: { status: "COMPLETED", resolvedAt: new Date() } });
      await settleOrderAfterReturn(tx, order.id);
    }
    await tx.trackingEvent.create({ data: { orderId: order.id, code: "REFUND_PROCESSED", title: "Refund processed", description: `A refund of ${(r.amount / 100).toFixed(2)} ${order.currency} was issued.` } });
    await audit({ action: "refund.processed", resourceType: "refund", resourceId: refundId, actor: opts.actor, metadata: { orderId: order.id, amount: r.amount } }, tx);
    return { refund: r, order };
  });
  if (!done) return null;
  await notify("refund.processed", { userId: done.order.userId, email: done.order.customerEmail, phone: done.order.customerPhone }, { orderNumber: done.order.orderNumber, amount: done.refund.amount });
  return db.refund.findUnique({ where: { id: refundId } });
}

export async function failRefundByProvider(providerRefundId: string, reason?: string) {
  const r = await db.refund.findFirst({ where: { providerRefundId } });
  if (r) await failRefund(r.id, reason ?? "Refund failed at provider");
}
