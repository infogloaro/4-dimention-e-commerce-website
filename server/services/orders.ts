import { db, withTransaction } from "../db/client";
import { AppError, notFound } from "../core/errors";
import { logger } from "../core/logger";
import type { AuthUser } from "../auth/session";
import { addHistory, addTrackingEvent, cancelInTx, loadOrder, moveStatus, toOrderView, type EventInput } from "./orders-core";
import { canTransition, CUSTOMER_CANCELLABLE, nextStatuses, TRACKING_COPY } from "../domain/order-state";
import { captureCodPayment } from "./payments";
import { refundOrder } from "./refunds";
import { audit } from "./audit";
import { notify } from "./notifications";
import type { OrderStatus, Prisma, ShipmentStatus } from "../db/generated/client";

// ───────────────────────────── customer reads ─────────────────────────────

export async function listOrders(userId: string, q: { status?: OrderStatus[]; search?: string; page: number; pageSize: number }) {
  const where: Prisma.OrderWhereInput = {
    userId,
    // abandoned / never-placed checkouts are not "orders" in the customer's history
    status: q.status?.length ? { in: q.status } : { notIn: ["FAILED"] },
    ...(q.search ? { OR: [{ orderNumber: { contains: q.search, mode: "insensitive" } }, { items: { some: { name: { contains: q.search, mode: "insensitive" } } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { items: { select: { id: true, name: true, imageUrl: true, quantity: true, variantName: true }, take: 4 }, _count: { select: { items: true } } } }),
    db.order.count({ where }),
  ]);
  return {
    total,
    items: rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      statusLabel: TRACKING_COPY[o.status].title,
      paymentStatus: o.paymentStatus,
      placedAt: o.placedAt ?? o.createdAt,
      grandTotal: o.grandTotal,
      currency: o.currency,
      itemCount: o._count.items,
      preview: o.items,
      estimatedDelivery: { min: o.estimatedDeliveryMin, max: o.estimatedDeliveryMax },
    })),
  };
}

export async function getOrder(userId: string, idOrNumber: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrNumber);
  return toOrderView(await loadOrder({ userId, ...(isUuid ? { id: idOrNumber } : { orderNumber: idOrNumber }) }));
}

export async function getTracking(userId: string, id: string) {
  const o = await getOrder(userId, id);
  return { orderId: o.id, orderNumber: o.orderNumber, ...o.tracking, shippingAddress: { city: (o.shippingAddress as { city?: string }).city, postalCode: (o.shippingAddress as { postalCode?: string }).postalCode }, items: o.items.map((i) => ({ id: i.id, name: i.name, imageUrl: i.imageUrl, quantity: i.quantity })) };
}

export async function getInvoice(userId: string | null, id: string) {
  const order = await loadOrder({ id, ...(userId ? { userId } : {}) });
  if (order.status === "PENDING_PAYMENT" || order.status === "FAILED") throw new AppError("ORDER_STATE_INVALID", "An invoice is available once the order is placed");
  const invoiceNumber = order.invoiceNumber ?? `INV-${order.orderNumber}`;
  if (!order.invoiceNumber) await db.order.update({ where: { id: order.id }, data: { invoiceNumber } });
  const v = toOrderView({ ...order, invoiceNumber });
  const taxByRate = new Map<number, { taxable: number; tax: number }>();
  for (const i of order.items) {
    const e = taxByRate.get(i.taxRateBps) ?? { taxable: 0, tax: 0 };
    e.tax += i.taxAmount;
    e.taxable += order.pricesIncludeTax ? i.lineTotal - i.taxAmount : i.lineTotal;
    taxByRate.set(i.taxRateBps, e);
  }
  const seller = await db.storeSetting.findUnique({ where: { key: "store.profile" } });
  return {
    invoiceNumber,
    issuedAt: order.placedAt ?? order.createdAt,
    orderNumber: order.orderNumber,
    seller: seller?.value ?? { name: "4D Commerce" },
    billTo: order.billingAddress,
    shipTo: order.shippingAddress,
    customer: v.customer,
    lines: v.items,
    totals: v.totals,
    taxBreakdown: [...taxByRate].map(([bps, x]) => ({ ratePercent: bps / 100, taxableAmount: x.taxable, taxAmount: x.tax })),
    paymentStatus: order.paymentStatus,
    currency: order.currency,
  };
}

// ───────────────────────────── cancellation ─────────────────────────────

async function finishCancellation(orderId: string, res: { cancelled: boolean; needsRefund: boolean }, reason: string, actor?: Pick<AuthUser, "id" | "roleKey"> | null) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!res.cancelled) return order;
  if (res.needsRefund) {
    await refundOrder({ orderId, reason: `Order cancelled: ${reason}`, actor, idempotencyKey: `cancel:${orderId}` }).catch((e) =>
      logger.error("auto-refund after cancellation failed — needs manual attention", { orderId, error: e instanceof Error ? e.message : String(e) }),
    );
  }
  await notify("order.cancelled", { userId: order.userId, email: order.customerEmail, phone: order.customerPhone }, { orderNumber: order.orderNumber, reason });
  return order;
}

export async function cancelOrderByCustomer(user: AuthUser, orderId: string, reason: string) {
  const owned = await db.order.findFirst({ where: { id: orderId, userId: user.id }, select: { id: true } });
  if (!owned) throw notFound("ORDER_NOT_FOUND", "Order");
  const res = await withTransaction((tx) => cancelInTx(tx, orderId, { reason, actorId: user.id, allowed: CUSTOMER_CANCELLABLE }));
  await audit({ action: "order.cancelled", resourceType: "order", resourceId: orderId, actor: user, metadata: { reason, by: "customer" } });
  await finishCancellation(orderId, res, reason, user);
  return getOrder(user.id, orderId);
}

// ───────────────────────────── staff operations ─────────────────────────────

const MANUAL_TARGETS: readonly OrderStatus[] = ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];

export async function transitionOrder(actor: AuthUser, orderId: string, to: OrderStatus, opts: { note?: string; location?: string; reason?: string } = {}) {
  if (!MANUAL_TARGETS.includes(to)) throw new AppError("ORDER_STATE_INVALID", `Orders cannot be moved to ${to} manually`, { allowed: MANUAL_TARGETS });
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("ORDER_NOT_FOUND", "Order");
  const from = order.status;
  if (!canTransition(from, to)) throw new AppError("ORDER_STATE_INVALID", `Cannot move an order from ${from} to ${to}`, { from, to, allowed: nextStatuses(from) });

  if (to === "CANCELLED") {
    if (actor && !actor.permissions.has("order:cancel")) throw new AppError("FORBIDDEN", "You do not have permission to cancel orders");
    const reason = opts.reason ?? opts.note ?? "Cancelled by store";
    const res = await withTransaction((tx) => cancelInTx(tx, orderId, { reason, actorId: actor.id }));
    await audit({ action: "order.status_changed", resourceType: "order", resourceId: orderId, actor, metadata: { from, to, reason } });
    await finishCancellation(orderId, res, reason, actor);
    return toOrderView(await loadOrder({ id: orderId }));
  }

  await withTransaction(async (tx) => {
    const now = new Date();
    const stamp: Prisma.OrderUpdateManyMutationInput = to === "CONFIRMED" ? { confirmedAt: now } : to === "SHIPPED" ? { shippedAt: now } : to === "DELIVERED" ? { deliveredAt: now } : {};
    if (!(await moveStatus(tx, orderId, from, to, stamp))) throw new AppError("CONFLICT", "The order was updated by someone else — refresh and retry");
    await addHistory(tx, orderId, from, to, actor.id, opts.note);
    const copy = TRACKING_COPY[to];
    await addTrackingEvent(tx, orderId, { code: copy.code, title: copy.title, description: opts.note ?? copy.description, location: opts.location });
    if (to === "SHIPPED" && !(await tx.shipment.count({ where: { orderId } }))) {
      await tx.shipment.create({ data: { orderId, status: "IN_TRANSIT", shippedAt: now, estimatedDelivery: order.estimatedDeliveryMax } });
    }
    if (to === "DELIVERED") {
      await captureCodPayment(orderId, tx as unknown as typeof db);
      await tx.shipment.updateMany({ where: { orderId, status: { not: "DELIVERED" } }, data: { status: "DELIVERED", deliveredAt: now } });
    }
    await audit({ action: "order.status_changed", resourceType: "order", resourceId: orderId, actor, metadata: { from, to, note: opts.note } }, tx);
  });

  const key = to === "SHIPPED" ? "order.shipped" : to === "OUT_FOR_DELIVERY" ? "order.out_for_delivery" : to === "DELIVERED" ? "order.delivered" : null;
  if (key) {
    const shipment = await db.shipment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
    await notify(key, { userId: order.userId, email: order.customerEmail, phone: order.customerPhone }, { orderNumber: order.orderNumber, carrier: shipment?.carrier ?? undefined, trackingNumber: shipment?.trackingNumber ?? undefined });
  }
  return toOrderView(await loadOrder({ id: orderId }));
}

export async function createShipment(actor: AuthUser, orderId: string, input: { carrier?: string; trackingNumber?: string; trackingUrl?: string; estimatedDelivery?: Date; items?: Array<{ orderItemId: string; quantity: number }> }) {
  const order = await loadOrder({ id: orderId });
  if (order.status !== "PACKED") throw new AppError("ORDER_STATE_INVALID", "Only PACKED orders can be shipped", { status: order.status });
  const lines = input.items ?? order.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity - i.cancelledQuantity - i.returnedQuantity }));
  const byId = new Map(order.items.map((i) => [i.id, i]));
  for (const l of lines) if (!byId.has(l.orderItemId) || l.quantity < 1 || l.quantity > byId.get(l.orderItemId)!.quantity) throw new AppError("VALIDATION_ERROR", "Invalid shipment item", { orderItemId: l.orderItemId });
  const shipment = await db.shipment.create({
    data: { orderId, carrier: input.carrier, trackingNumber: input.trackingNumber, trackingUrl: input.trackingUrl, status: "PICKED_UP", shippedAt: new Date(), estimatedDelivery: input.estimatedDelivery ?? order.estimatedDeliveryMax, items: { create: lines } },
  });
  await transitionOrder(actor, orderId, "SHIPPED", { note: input.carrier ? `Handed to ${input.carrier}${input.trackingNumber ? ` (${input.trackingNumber})` : ""}` : undefined });
  await audit({ action: "shipment.created", resourceType: "shipment", resourceId: shipment.id, actor, metadata: { orderId, carrier: input.carrier, trackingNumber: input.trackingNumber } });
  return shipment;
}

const SHIPMENT_TO_ORDER: Partial<Record<ShipmentStatus, OrderStatus>> = { OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY", DELIVERED: "DELIVERED" };
const SHIPMENT_EVENT: Record<ShipmentStatus, { code: string; title: string }> = {
  PENDING: { code: "SHIPMENT_PENDING", title: "Shipment pending" },
  LABEL_CREATED: { code: "LABEL_CREATED", title: "Shipping label created" },
  PICKED_UP: { code: "PICKED_UP", title: "Picked up by carrier" },
  IN_TRANSIT: { code: "IN_TRANSIT", title: "In transit" },
  REACHED_HUB: { code: "REACHED_HUB", title: "Reached hub" },
  OUT_FOR_DELIVERY: { code: "OUT_FOR_DELIVERY", title: "Out for delivery" },
  DELIVERED: { code: "DELIVERED", title: "Delivered" },
  FAILED_DELIVERY: { code: "DELIVERY_ATTEMPT_FAILED", title: "Delivery attempt failed" },
  RETURNED_TO_SENDER: { code: "RETURNED_TO_SENDER", title: "Returned to sender" },
};

export async function updateShipment(actor: AuthUser, shipmentId: string, input: { status: ShipmentStatus; location?: string; description?: string; trackingNumber?: string }) {
  const s = await db.shipment.findUnique({ where: { id: shipmentId }, include: { order: { select: { id: true, status: true } } } });
  if (!s) throw notFound("ORDER_NOT_FOUND", "Shipment");
  await db.shipment.update({ where: { id: shipmentId }, data: { status: input.status, trackingNumber: input.trackingNumber, ...(input.status === "DELIVERED" ? { deliveredAt: new Date() } : {}) } });
  const target = SHIPMENT_TO_ORDER[input.status];
  if (target && canTransition(s.order.status, target)) {
    await transitionOrder(actor, s.orderId, target, { note: input.description, location: input.location });
  } else {
    const ev = SHIPMENT_EVENT[input.status];
    await addTrackingEvent(db, s.orderId, { code: ev.code, title: ev.title, description: input.description, location: input.location, shipmentId });
  }
  await audit({ action: "shipment.updated", resourceType: "shipment", resourceId: shipmentId, actor, metadata: { status: input.status } });
}

export async function addCustomTrackingEvent(actor: AuthUser, orderId: string, e: Required<Pick<EventInput, "title">> & Partial<EventInput>) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!o) throw notFound("ORDER_NOT_FOUND", "Order");
  const ev = await addTrackingEvent(db, orderId, { code: e.code ?? "NOTE", title: e.title, description: e.description, location: e.location, metadata: e.metadata, shipmentId: e.shipmentId });
  await audit({ action: "order.tracking_event_added", resourceType: "order", resourceId: orderId, actor, metadata: { title: e.title } });
  return ev;
}

// ───────────────────────────── admin reads ─────────────────────────────

export async function adminListOrders(q: { search?: string; status?: OrderStatus[]; paymentStatus?: string; from?: Date; to?: Date; userId?: string; page: number; pageSize: number }) {
  const where: Prisma.OrderWhereInput = {
    ...(q.status?.length ? { status: { in: q.status } } : {}),
    ...(q.paymentStatus ? { paymentStatus: q.paymentStatus as Prisma.EnumPaymentStatusFilter["equals"] } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.search ? { OR: [{ orderNumber: { contains: q.search, mode: "insensitive" } }, { customerEmail: { contains: q.search, mode: "insensitive" } }, { customerName: { contains: q.search, mode: "insensitive" } }, { customerPhone: { contains: q.search } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, orderNumber: true, status: true, paymentStatus: true, grandTotal: true, currency: true, customerName: true, customerEmail: true, createdAt: true, placedAt: true, userId: true, _count: { select: { items: true } }, payments: { take: 1, orderBy: { createdAt: "desc" }, select: { provider: true } } } }),
    db.order.count({ where }),
  ]);
  return { total, items: rows.map(({ _count, payments, ...o }) => ({ ...o, itemCount: _count.items, paymentProvider: payments[0]?.provider ?? null })) };
}

export async function adminGetOrder(id: string) {
  const o = await loadOrder({ id });
  return { ...toOrderView(o), allowedTransitions: nextStatuses(o.status).filter((s) => ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].includes(s)), history: o.statusHistory };
}
