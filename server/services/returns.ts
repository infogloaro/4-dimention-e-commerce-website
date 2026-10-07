import { db, withTransaction } from "../db/client";
import { AppError, notFound } from "../core/errors";
import { randomCode } from "../core/text";
import type { AuthUser } from "../auth/session";
import { addHistory, addTrackingEvent, moveStatus, RETURN_WINDOW_DAYS, settleOrderAfterReturn } from "./orders-core";
import { restockSold } from "./inventory";
import { refundOrder } from "./refunds";
import { canTransitionReturn, type ReturnStatusKey } from "../domain/order-state";
import { audit } from "./audit";
import { notify } from "./notifications";
import type { Prisma, ReturnResolution, ReturnStatus } from "../db/generated/client";

const OPEN: ReturnStatus[] = ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "PICKED_UP", "RECEIVED", "REFUND_PENDING"];

export interface ReturnRequestInput {
  items: Array<{ orderItemId: string; quantity: number; reason?: string }>;
  reason: string;
  details?: string;
  resolution: ReturnResolution;
  evidenceUrls?: string[];
}

export async function requestReturn(user: AuthUser, orderId: string, input: ReturnRequestInput) {
  const created = await withTransaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Order" WHERE id = ${orderId} AND "userId" = ${user.id} FOR UPDATE`;
    if (rows.length === 0) throw notFound("ORDER_NOT_FOUND", "Order");
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    if (order.status !== "DELIVERED" && order.status !== "RETURN_REQUESTED") throw new AppError("RETURN_NOT_ELIGIBLE", "Only delivered orders can be returned", { status: order.status });
    const deadline = order.deliveredAt ? order.deliveredAt.getTime() + RETURN_WINDOW_DAYS * 86_400_000 : 0;
    if (!order.deliveredAt || Date.now() > deadline) throw new AppError("RETURN_NOT_ELIGIBLE", `The ${RETURN_WINDOW_DAYS}-day return window has closed`, { windowEndedAt: order.deliveredAt ? new Date(deadline) : null });

    const pending = await tx.returnItem.groupBy({ by: ["orderItemId"], where: { returnRequest: { orderId, status: { in: OPEN } } }, _sum: { quantity: true } });
    const pendingQty = new Map(pending.map((p) => [p.orderItemId, p._sum.quantity ?? 0]));
    const byId = new Map(order.items.map((i) => [i.id, i]));
    const seen = new Set<string>();
    for (const l of input.items) {
      const item = byId.get(l.orderItemId);
      if (!item) throw new AppError("RETURN_NOT_ELIGIBLE", "Item does not belong to this order", { orderItemId: l.orderItemId });
      if (seen.has(l.orderItemId)) throw new AppError("VALIDATION_ERROR", "Duplicate item in return request");
      seen.add(l.orderItemId);
      const available = item.quantity - item.returnedQuantity - item.cancelledQuantity - (pendingQty.get(item.id) ?? 0);
      if (l.quantity > available) throw new AppError("RETURN_NOT_ELIGIBLE", `Only ${Math.max(available, 0)} unit(s) of "${item.name}" can still be returned`, { orderItemId: item.id, available: Math.max(available, 0) });
    }

    const rr = await tx.returnRequest.create({
      data: { number: `RET-${randomCode(8)}`, orderId, userId: user.id, reason: input.reason, details: input.details, resolution: input.resolution, evidenceUrls: input.evidenceUrls ?? [], items: { create: input.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity, reason: i.reason })) } },
    });
    if (order.status === "DELIVERED" && (await moveStatus(tx, orderId, "DELIVERED", "RETURN_REQUESTED"))) {
      await addHistory(tx, orderId, "DELIVERED", "RETURN_REQUESTED", user.id, input.reason);
    }
    await addTrackingEvent(tx, orderId, { code: "RETURN_REQUESTED", title: "Return requested", description: `Return ${rr.number}: ${input.reason}` });
    await audit({ action: "return.requested", resourceType: "return", resourceId: rr.id, actor: user, metadata: { orderId, items: input.items.length } }, tx);
    return { rr, order };
  });
  await notify("return.requested", { userId: user.id, email: user.email }, { number: created.rr.number });
  return getReturn(user.id, created.rr.id);
}

const returnInclude = {
  items: { include: { orderItem: { select: { name: true, imageUrl: true, unitPrice: true, quantity: true, variantName: true } } } },
  order: { select: { orderNumber: true } },
  refunds: { select: { id: true, amount: true, status: true, processedAt: true } },
} satisfies Prisma.ReturnRequestInclude;

const timelineFor = (r: { status: ReturnStatus; createdAt: Date }) => {
  const steps: ReturnStatusKey[] = ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "PICKED_UP", "RECEIVED", "REFUND_PENDING", "COMPLETED"];
  const idx = steps.indexOf(r.status as ReturnStatusKey);
  const dead = r.status === "REJECTED" || r.status === "CANCELLED";
  return steps.map((s, i) => ({ status: s, state: dead ? (i === 0 ? "completed" : "skipped") : i < idx ? "completed" : i === idx ? "current" : "upcoming" }));
};

export async function getReturn(userId: string | null, id: string) {
  const r = await db.returnRequest.findFirst({ where: { id, ...(userId ? { userId } : {}) }, include: returnInclude });
  if (!r) throw notFound("RETURN_NOT_FOUND", "Return request");
  return { ...r, timeline: timelineFor(r) };
}

export async function listReturns(userId: string, page: number, pageSize: number) {
  const where = { userId };
  const [rows, total] = await Promise.all([db.returnRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: returnInclude }), db.returnRequest.count({ where })]);
  return { total, items: rows.map((r) => ({ ...r, timeline: timelineFor(r) })) };
}

export async function cancelReturn(user: AuthUser, id: string) {
  await withTransaction(async (tx) => {
    const r = await tx.returnRequest.findFirst({ where: { id, userId: user.id } });
    if (!r) throw notFound("RETURN_NOT_FOUND", "Return request");
    if (!canTransitionReturn(r.status as ReturnStatusKey, "CANCELLED")) throw new AppError("RETURN_STATE_INVALID", "This return can no longer be cancelled");
    await tx.returnRequest.update({ where: { id }, data: { status: "CANCELLED", resolvedAt: new Date() } });
    await settleOrderAfterReturn(tx, r.orderId);
  });
  return getReturn(user.id, id);
}

// ───────────────────────────── staff workflow ─────────────────────────────

export async function adminListReturns(q: { status?: ReturnStatus[]; page: number; pageSize: number }) {
  const where: Prisma.ReturnRequestWhereInput = q.status?.length ? { status: { in: q.status } } : {};
  const [rows, total] = await Promise.all([db.returnRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { ...returnInclude, user: { select: { name: true, email: true } } } }), db.returnRequest.count({ where })]);
  return { total, items: rows };
}

export async function decideReturn(actor: AuthUser, id: string, decision: { approve: boolean; note?: string; pickupScheduledAt?: Date }) {
  const r = await db.returnRequest.findUnique({ where: { id }, include: { order: true, user: true } });
  if (!r) throw notFound("RETURN_NOT_FOUND", "Return request");
  const to: ReturnStatusKey = decision.approve ? "APPROVED" : "REJECTED";
  if (!canTransitionReturn(r.status as ReturnStatusKey, to)) throw new AppError("RETURN_STATE_INVALID", `Cannot move a ${r.status} return to ${to}`);
  await withTransaction(async (tx) => {
    const flip = await tx.returnRequest.updateMany({ where: { id, status: r.status }, data: { status: to, adminNote: decision.note, ...(decision.approve && decision.pickupScheduledAt ? { pickupScheduledAt: decision.pickupScheduledAt, status: "PICKUP_SCHEDULED" } : {}), ...(!decision.approve ? { resolvedAt: new Date() } : {}) } });
    if (flip.count !== 1) throw new AppError("CONFLICT", "The return was updated by someone else — refresh and retry");
    if (!decision.approve) await settleOrderAfterReturn(tx, r.orderId);
    await addTrackingEvent(tx, r.orderId, { code: decision.approve ? "RETURN_APPROVED" : "RETURN_REJECTED", title: decision.approve ? "Return approved" : "Return not approved", description: decision.note });
    await audit({ action: decision.approve ? "return.approved" : "return.rejected", resourceType: "return", resourceId: id, actor, metadata: { note: decision.note } }, tx);
  });
  await notify(decision.approve ? "return.approved" : "return.rejected", { userId: r.userId, email: r.user.email }, { number: r.number, note: decision.note });
  return getReturn(null, id);
}

export async function advanceReturn(actor: AuthUser, id: string, to: Extract<ReturnStatusKey, "PICKUP_SCHEDULED" | "PICKED_UP" | "RECEIVED">, opts: { pickupScheduledAt?: Date; note?: string } = {}) {
  const r = await db.returnRequest.findUnique({ where: { id }, include: { items: { include: { orderItem: true } }, order: true } });
  if (!r) throw notFound("RETURN_NOT_FOUND", "Return request");
  if (!canTransitionReturn(r.status as ReturnStatusKey, to)) throw new AppError("RETURN_STATE_INVALID", `Cannot move a ${r.status} return to ${to}`);

  if (to !== "RECEIVED") {
    await db.returnRequest.update({ where: { id }, data: { status: to, pickupScheduledAt: opts.pickupScheduledAt ?? r.pickupScheduledAt, adminNote: opts.note ?? r.adminNote } });
    await addTrackingEvent(db, r.orderId, { code: to, title: to === "PICKUP_SCHEDULED" ? "Return pickup scheduled" : "Return picked up", description: opts.note });
    await audit({ action: "return.status_changed", resourceType: "return", resourceId: id, actor, metadata: { to } });
    return getReturn(null, id);
  }

  // RECEIVED: goods are back — restock, count them as returned, then settle money
  const refundAmount = await withTransaction(async (tx) => {
    const flip = await tx.returnRequest.updateMany({ where: { id, status: r.status }, data: { status: "RECEIVED", receivedAt: new Date(), adminNote: opts.note ?? r.adminNote } });
    if (flip.count !== 1) throw new AppError("CONFLICT", "The return was updated by someone else — refresh and retry");
    let amount = 0;
    for (const li of r.items) {
      const oi = li.orderItem;
      const share = Math.round((oi.lineTotal * li.quantity) / oi.quantity);
      amount += share;
      await tx.$executeRaw`UPDATE "OrderItem" SET "returnedQuantity" = "returnedQuantity" + ${li.quantity} WHERE id = ${oi.id}`;
      if (li.restock && oi.variantId) await restockSold(tx, oi.variantId, li.quantity, "RETURN", "return", id, `Return ${r.number}`);
      if (oi.productId) await tx.product.update({ where: { id: oi.productId }, data: { soldCount: { decrement: li.quantity } } });
    }
    await addTrackingEvent(tx, r.orderId, { code: "RETURN_RECEIVED", title: "Return received", description: "We received your returned item(s)." });
    if (r.resolution === "REPLACEMENT") {
      await tx.returnRequest.update({ where: { id }, data: { status: "COMPLETED", resolvedAt: new Date() } });
      await settleOrderAfterReturn(tx, r.orderId);
    } else {
      await tx.returnRequest.update({ where: { id }, data: { status: "REFUND_PENDING" } });
    }
    await audit({ action: "return.received", resourceType: "return", resourceId: id, actor, metadata: { refundAmount: amount } }, tx);
    return r.resolution === "REFUND" ? amount : 0;
  });

  if (refundAmount > 0) {
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    if (order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_REFUNDED") {
      await refundOrder({ orderId: r.orderId, amount: Math.min(refundAmount, order.grandTotal - order.refundedTotal), reason: `Return ${r.number}`, actor, returnRequestId: id, idempotencyKey: `return:${id}` });
    }
  }
  return getReturn(null, id);
}
