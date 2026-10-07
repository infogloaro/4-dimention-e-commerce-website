import { db, type Db, type TxClient } from "../db/client";
import { randomCode } from "../core/text";
import { AppError, notFound } from "../core/errors";
import { commitReservation, releaseReservation, restockSold } from "./inventory";
import { releaseCouponUse } from "./coupons";
import { canTransition, CUSTOMER_CANCELLABLE, HAPPY_PATH, TRACKING_COPY, nextStatuses } from "../domain/order-state";
import type { OrderStatus, Prisma } from "../db/generated/client";

export const RETURN_WINDOW_DAYS = 10;

export function newOrderNumber(): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `4D-${ymd}-${randomCode(6)}`;
}

export interface EventInput {
  code: string;
  title: string;
  description?: string | null;
  location?: string | null;
  metadata?: Prisma.InputJsonValue;
  shipmentId?: string | null;
  occurredAt?: Date;
}

export async function addTrackingEvent(tx: Db, orderId: string, e: EventInput) {
  return tx.trackingEvent.create({ data: { orderId, code: e.code, title: e.title, description: e.description, location: e.location, metadata: e.metadata, shipmentId: e.shipmentId, occurredAt: e.occurredAt ?? new Date() } });
}

export async function addHistory(tx: Db, orderId: string, from: OrderStatus | null, to: OrderStatus, actorId?: string | null, note?: string | null) {
  await tx.orderStatusHistory.create({ data: { orderId, fromStatus: from, toStatus: to, actorId: actorId ?? undefined, note: note ?? undefined } });
}

/**
 * Atomically move an order along the state machine. The `updateMany ... WHERE status = from` guard makes concurrent or
 * repeated transitions safe: only one caller wins, the rest see `false`.
 */
export async function moveStatus(tx: TxClient, orderId: string, from: OrderStatus, to: OrderStatus, data: Prisma.OrderUpdateManyMutationInput = {}): Promise<boolean> {
  if (!canTransition(from, to)) throw new AppError("ORDER_STATE_INVALID", `Cannot move an order from ${from} to ${to}`, { from, to, allowed: nextStatuses(from) });
  const res = await tx.order.updateMany({ where: { id: orderId, status: from }, data: { ...data, status: to } });
  return res.count === 1;
}

/** PENDING_PAYMENT → PLACED. Commits reserved stock, bumps sales counters, clears purchased cart lines. Idempotent. */
export async function finalizePlacement(tx: TxClient, orderId: string, opts: { paid: boolean; actorId?: string | null }): Promise<boolean> {
  const now = new Date();
  const moved = await moveStatus(tx, orderId, "PENDING_PAYMENT", "PLACED", { placedAt: now, reservationExpiresAt: null, ...(opts.paid ? { paymentStatus: "PAID", paidAt: now } : {}) });
  if (!moved) return false;
  await commitReservation(tx, orderId);

  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { select: { productId: true, variantId: true, quantity: true } } } });
  const perProduct = new Map<string, number>();
  for (const i of order.items) if (i.productId) perProduct.set(i.productId, (perProduct.get(i.productId) ?? 0) + i.quantity);
  for (const [productId, qty] of perProduct) await tx.product.update({ where: { id: productId }, data: { soldCount: { increment: qty } } });

  if (order.userId) {
    await tx.user.update({ where: { id: order.userId }, data: { ordersCount: { increment: 1 }, lifetimeValue: { increment: order.grandTotal } } });
    const variantIds = order.items.map((i) => i.variantId).filter((v): v is string => !!v);
    const cart = await tx.cart.findUnique({ where: { userId: order.userId }, select: { id: true } });
    if (cart && variantIds.length) {
      await tx.cartItem.deleteMany({ where: { cartId: cart.id, variantId: { in: variantIds }, savedForLater: false } });
      const left = await tx.cartItem.count({ where: { cartId: cart.id, savedForLater: false } });
      if (left === 0) await tx.cart.update({ where: { id: cart.id }, data: { couponCodes: [] } });
    }
  }

  await addHistory(tx, orderId, "PENDING_PAYMENT", "PLACED", opts.actorId, opts.paid ? "Payment confirmed" : "Cash on delivery order confirmed");
  if (opts.paid) await addTrackingEvent(tx, orderId, { code: "PAYMENT_CONFIRMED", title: "Payment confirmed", description: "We received your payment." });
  await addTrackingEvent(tx, orderId, { code: "ORDER_PLACED", title: TRACKING_COPY.PLACED.title, description: TRACKING_COPY.PLACED.description });
  return true;
}

/**
 * Cancel an order and unwind everything it touched (stock, coupon, open payment attempts).
 * Returns whether money has to go back to the customer — the caller issues the refund (outside this tx).
 */
export async function cancelInTx(tx: TxClient, orderId: string, opts: { reason: string; actorId?: string | null; allowed?: readonly OrderStatus[] }): Promise<{ cancelled: boolean; needsRefund: boolean; from: OrderStatus }> {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw notFound("ORDER_NOT_FOUND", "Order");
  if (opts.allowed && !opts.allowed.includes(order.status)) throw new AppError("ORDER_NOT_CANCELLABLE", "This order can no longer be cancelled", { status: order.status });
  const from = order.status;
  const moved = await moveStatus(tx, orderId, from, "CANCELLED", { cancelledAt: new Date(), cancelReason: opts.reason, reservationExpiresAt: null });
  if (!moved) return { cancelled: false, needsRefund: false, from };

  if (from === "PENDING_PAYMENT") {
    await releaseReservation(tx, orderId, `Order cancelled: ${opts.reason}`);
  } else {
    // stock was committed — put it back on the shelf and undo sales counters
    for (const i of order.items) {
      const qty = i.quantity - i.cancelledQuantity - i.returnedQuantity;
      if (i.variantId && qty > 0) await restockSold(tx, i.variantId, qty, "CORRECTION", "order", orderId, `Order cancelled: ${opts.reason}`);
      if (i.productId && qty > 0) await tx.product.update({ where: { id: i.productId }, data: { soldCount: { decrement: qty } } });
    }
    if (order.userId) await tx.user.update({ where: { id: order.userId }, data: { ordersCount: { decrement: 1 } } });
  }
  await tx.$executeRaw`UPDATE "OrderItem" SET "cancelledQuantity" = quantity - "returnedQuantity" WHERE "orderId" = ${orderId}`;
  await releaseCouponUse(tx, orderId);
  await tx.payment.updateMany({ where: { orderId, status: { in: ["CREATED", "REQUIRES_ACTION"] } }, data: { status: "CANCELLED" } });
  if (order.paymentStatus === "UNPAID" || order.paymentStatus === "PENDING") await tx.order.update({ where: { id: orderId }, data: { paymentStatus: from === "PENDING_PAYMENT" ? "FAILED" : "UNPAID" } });

  await addHistory(tx, orderId, from, "CANCELLED", opts.actorId, opts.reason);
  await addTrackingEvent(tx, orderId, { code: "CANCELLED", title: TRACKING_COPY.CANCELLED.title, description: opts.reason });
  return { cancelled: true, needsRefund: order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_REFUNDED", from };
}

// ───────────────────────────── read models ─────────────────────────────

const orderInclude = {
  items: { orderBy: { createdAt: "asc" as const } },
  statusHistory: { orderBy: { createdAt: "asc" as const } },
  trackingEvents: { orderBy: { occurredAt: "desc" as const } },
  shipments: { include: { items: true }, orderBy: { createdAt: "asc" as const } },
  payments: { orderBy: { createdAt: "desc" as const }, select: { id: true, provider: true, method: true, status: true, amount: true, paidAt: true, failureReason: true, createdAt: true } },
  refunds: { orderBy: { createdAt: "desc" as const }, select: { id: true, amount: true, status: true, reason: true, processedAt: true, createdAt: true } },
  returns: { select: { id: true, number: true, status: true, createdAt: true } },
};

export type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export async function loadOrder(where: Prisma.OrderWhereInput): Promise<FullOrder> {
  const o = await db.order.findFirst({ where, include: orderInclude });
  if (!o) throw notFound("ORDER_NOT_FOUND", "Order");
  return o;
}

export function trackingProgress(order: Pick<FullOrder, "status" | "statusHistory">) {
  const reachedAt = new Map<OrderStatus, Date>();
  for (const h of order.statusHistory) if (!reachedAt.has(h.toStatus)) reachedAt.set(h.toStatus, h.createdAt);
  const terminalBranch = (["CANCELLED", "FAILED"] as OrderStatus[]).includes(order.status);
  const idxCurrent = HAPPY_PATH.indexOf(order.status);
  const lastReached = HAPPY_PATH.reduce((acc, s, i) => (reachedAt.has(s) ? i : acc), -1);
  const current = idxCurrent >= 0 ? idxCurrent : order.status === "RETURN_REQUESTED" || order.status === "RETURNED" ? HAPPY_PATH.length - 1 : lastReached;
  return HAPPY_PATH.map((s, i) => ({
    status: s,
    label: TRACKING_COPY[s].title,
    description: TRACKING_COPY[s].description,
    at: reachedAt.get(s) ?? null,
    state: terminalBranch && i > lastReached ? ("skipped" as const) : i < current || (i === current && order.status === "DELIVERED") ? ("completed" as const) : i === current ? ("current" as const) : ("upcoming" as const),
  }));
}

export function toOrderView(o: FullOrder, now = new Date()) {
  const returnWindowEnds = o.deliveredAt ? new Date(o.deliveredAt.getTime() + RETURN_WINDOW_DAYS * 86_400_000) : null;
  const items = o.items.map((i) => {
    const returnable = Math.max(0, i.quantity - i.returnedQuantity - i.cancelledQuantity);
    return {
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      sku: i.sku,
      name: i.name,
      variantName: i.variantName,
      brand: i.brandName,
      imageUrl: i.imageUrl,
      attributes: i.attributes,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      compareAtPrice: i.compareAtPrice,
      discountAmount: i.discountAmount,
      taxRatePercent: i.taxRateBps / 100,
      taxAmount: i.taxAmount,
      lineTotal: i.lineTotal,
      cancelledQuantity: i.cancelledQuantity,
      returnedQuantity: i.returnedQuantity,
      returnableQuantity: returnable,
    };
  });
  const delivered = o.status === "DELIVERED" || o.status === "RETURN_REQUESTED" || o.status === "RETURNED";
  const inWindow = !!returnWindowEnds && now <= returnWindowEnds;
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    invoiceNumber: o.invoiceNumber,
    status: o.status,
    statusLabel: TRACKING_COPY[o.status].title,
    paymentStatus: o.paymentStatus,
    currency: o.currency,
    placedAt: o.placedAt,
    createdAt: o.createdAt,
    totals: { subtotal: o.subtotal, discount: o.discountTotal, shipping: o.shippingTotal, tax: o.taxTotal, grandTotal: o.grandTotal, refunded: o.refundedTotal, pricesIncludeTax: o.pricesIncludeTax },
    items,
    shippingAddress: o.shippingAddress,
    billingAddress: o.billingAddress,
    shipping: { method: o.shippingMethodCode, details: o.shippingSnapshot, estimatedDelivery: { min: o.estimatedDeliveryMin, max: o.estimatedDeliveryMax } },
    coupon: o.couponSnapshot,
    customer: { name: o.customerName, email: o.customerEmail, phone: o.customerPhone },
    notes: o.notes,
    payments: o.payments,
    refunds: o.refunds,
    returns: o.returns,
    cancelReason: o.cancelReason,
    timestamps: { paidAt: o.paidAt, confirmedAt: o.confirmedAt, shippedAt: o.shippedAt, deliveredAt: o.deliveredAt, cancelledAt: o.cancelledAt },
    tracking: {
      status: o.status,
      progress: trackingProgress(o),
      events: o.trackingEvents.map((e) => ({ id: e.id, code: e.code, title: e.title, description: e.description, location: e.location, occurredAt: e.occurredAt, metadata: e.metadata, shipmentId: e.shipmentId })),
      shipments: o.shipments.map((s) => ({ id: s.id, carrier: s.carrier, trackingNumber: s.trackingNumber, trackingUrl: s.trackingUrl, status: s.status, shippedAt: s.shippedAt, estimatedDelivery: s.estimatedDelivery, deliveredAt: s.deliveredAt, items: s.items.map((x) => ({ orderItemId: x.orderItemId, quantity: x.quantity })) })),
      estimatedDelivery: { min: o.estimatedDeliveryMin, max: o.estimatedDeliveryMax },
    },
    actions: {
      canCancel: CUSTOMER_CANCELLABLE.includes(o.status),
      canReturn: (o.status === "DELIVERED" || o.status === "RETURN_REQUESTED") && inWindow && items.some((i) => i.returnableQuantity > 0),
      returnWindowEndsAt: returnWindowEnds,
      canReview: delivered,
      canPay: o.status === "PENDING_PAYMENT" && (!o.reservationExpiresAt || o.reservationExpiresAt > now),
      canDownloadInvoice: o.status !== "PENDING_PAYMENT" && o.status !== "FAILED",
    },
  };
}

export type OrderView = ReturnType<typeof toOrderView>;

/**
 * After a return finishes, decide where the order goes: still RETURN_REQUESTED while other returns are open,
 * RETURNED when nothing deliverable is left, otherwise back to DELIVERED (partial return).
 */
export async function settleOrderAfterReturn(tx: TxClient, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || (order.status !== "RETURN_REQUESTED" && order.status !== "DELIVERED")) return;
  const open = await tx.returnRequest.count({ where: { orderId, status: { in: ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "PICKED_UP", "RECEIVED", "REFUND_PENDING"] } } });
  if (open > 0) return;
  const remaining = order.items.reduce((s, i) => s + (i.quantity - i.returnedQuantity - i.cancelledQuantity), 0);
  const to: OrderStatus = remaining === 0 ? "RETURNED" : "DELIVERED";
  if (order.status === to) return;
  if (await moveStatus(tx, orderId, order.status, to)) {
    await addHistory(tx, orderId, order.status, to, null, remaining === 0 ? "All items returned" : "Return closed");
    await addTrackingEvent(tx, orderId, { code: to === "RETURNED" ? "RETURNED" : "DELIVERED", title: to === "RETURNED" ? "Returned" : "Return closed", description: to === "RETURNED" ? "The returned items were received." : "The remaining items stay with you." });
  }
}
