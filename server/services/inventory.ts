import { db, withTransaction, type Db, type TxClient } from "../db/client";
import { AppError } from "../core/errors";
import { audit } from "./audit";
import type { StockMovementType } from "../db/generated/client";
import type { AuthUser } from "../auth/session";

/**
 * Inventory invariants (also enforced by DB CHECK constraints):
 *   quantity >= 0,  0 <= reserved <= quantity,  available = quantity - reserved
 *
 * Every mutation is a single atomic conditional UPDATE ("...WHERE quantity - reserved >= n"), so two buyers
 * racing for the last unit can never both succeed — one of the updates matches zero rows.
 */

interface InvRow {
  quantity: number;
  reserved: number;
}

export interface StockLine {
  variantId: string;
  quantity: number;
}

const byVariant = (a: StockLine, b: StockLine) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0);

async function logMovement(
  tx: Db,
  m: { variantId: string; type: StockMovementType; quantityDelta: number; reservedDelta: number; after: InvRow; reason?: string; refType?: string; refId?: string; actorId?: string },
) {
  await tx.stockMovement.create({
    data: {
      variantId: m.variantId,
      type: m.type,
      quantityDelta: m.quantityDelta,
      reservedDelta: m.reservedDelta,
      quantityAfter: m.after.quantity,
      reservedAfter: m.after.reserved,
      reason: m.reason,
      refType: m.refType,
      refId: m.refId,
      actorId: m.actorId,
    },
  });
}

/** Mark the products' `inStock` read-model flag after stock changed. One statement, no N+1. */
export async function refreshStockFlags(tx: Db, variantIds: string[]) {
  if (variantIds.length === 0) return;
  await tx.$executeRaw`
    UPDATE "Product" p SET "inStock" = EXISTS (
      SELECT 1 FROM "ProductVariant" v JOIN "Inventory" i ON i."variantId" = v.id
      WHERE v."productId" = p.id AND v."isActive" AND (i."allowBackorder" OR i.quantity - i.reserved > 0)
    )
    WHERE p.id IN (SELECT "productId" FROM "ProductVariant" WHERE id = ANY(${variantIds}::text[]))`;
}

export async function getAvailability(variantIds: string[], client: Db = db): Promise<Map<string, { available: number; allowBackorder: boolean; lowStockThreshold: number }>> {
  const rows = await client.inventory.findMany({ where: { variantId: { in: variantIds } } });
  return new Map(
    rows.map((r) => [r.variantId, { available: Math.max(0, r.quantity - r.reserved), allowBackorder: r.allowBackorder, lowStockThreshold: r.lowStockThreshold }]),
  );
}

/** Reserve stock for an order. Throws INSUFFICIENT_STOCK (with the offending variant) if any line cannot be satisfied. */
export async function reserveStock(tx: TxClient, orderId: string, lines: StockLine[], expiresAt: Date, actorId?: string) {
  for (const line of [...lines].sort(byVariant)) {
    const rows = await tx.$queryRaw<InvRow[]>`
      UPDATE "Inventory" SET reserved = reserved + ${line.quantity}, "updatedAt" = now()
      WHERE "variantId" = ${line.variantId} AND ("allowBackorder" OR quantity - reserved >= ${line.quantity})
      RETURNING quantity, reserved`;
    if (rows.length === 0) {
      const inv = await tx.inventory.findUnique({ where: { variantId: line.variantId } });
      const available = inv ? Math.max(0, inv.quantity - inv.reserved) : 0;
      throw new AppError(available === 0 ? "OUT_OF_STOCK" : "INSUFFICIENT_STOCK", available === 0 ? "This item is out of stock" : `Only ${available} left in stock`, {
        variantId: line.variantId,
        available,
        requested: line.quantity,
      });
    }
    await tx.stockReservation.create({ data: { orderId, variantId: line.variantId, quantity: line.quantity, expiresAt } });
    await logMovement(tx, { variantId: line.variantId, type: "RESERVE", quantityDelta: 0, reservedDelta: line.quantity, after: rows[0]!, refType: "order", refId: orderId, actorId });
  }
}

/** Convert an order's ACTIVE reservations into a sale (payment captured / COD confirmed). Idempotent. */
export async function commitReservation(tx: TxClient, orderId: string) {
  const claimed = await tx.stockReservation.findMany({ where: { orderId, status: "ACTIVE" } });
  const touched: string[] = [];
  for (const r of claimed.sort((a, b) => (a.variantId < b.variantId ? -1 : 1))) {
    // claim the row first: only one concurrent committer wins
    const flip = await tx.stockReservation.updateMany({ where: { id: r.id, status: "ACTIVE" }, data: { status: "COMMITTED" } });
    if (flip.count !== 1) continue;
    const rows = await tx.$queryRaw<InvRow[]>`
      UPDATE "Inventory" SET quantity = quantity - ${r.quantity}, reserved = reserved - ${r.quantity}, sold = sold + ${r.quantity}, "updatedAt" = now()
      WHERE "variantId" = ${r.variantId} AND reserved >= ${r.quantity} AND quantity >= ${r.quantity}
      RETURNING quantity, reserved`;
    if (rows.length === 0) throw new AppError("CONFLICT", "Reservation could not be committed — inventory out of sync", { variantId: r.variantId });
    await logMovement(tx, { variantId: r.variantId, type: "SALE", quantityDelta: -r.quantity, reservedDelta: -r.quantity, after: rows[0]!, refType: "order", refId: orderId });
    touched.push(r.variantId);
  }
  await refreshStockFlags(tx, touched);
  return touched.length;
}

/** Give reserved (uncommitted) stock back. Idempotent. */
export async function releaseReservation(tx: TxClient, orderId: string, reason: string, status: "RELEASED" | "EXPIRED" = "RELEASED") {
  const active = await tx.stockReservation.findMany({ where: { orderId, status: "ACTIVE" } });
  const touched: string[] = [];
  for (const r of active.sort((a, b) => (a.variantId < b.variantId ? -1 : 1))) {
    const flip = await tx.stockReservation.updateMany({ where: { id: r.id, status: "ACTIVE" }, data: { status } });
    if (flip.count !== 1) continue;
    const rows = await tx.$queryRaw<InvRow[]>`
      UPDATE "Inventory" SET reserved = GREATEST(reserved - ${r.quantity}, 0), "updatedAt" = now()
      WHERE "variantId" = ${r.variantId} RETURNING quantity, reserved`;
    if (rows[0]) await logMovement(tx, { variantId: r.variantId, type: "RELEASE", quantityDelta: 0, reservedDelta: -r.quantity, after: rows[0], reason, refType: "order", refId: orderId });
    touched.push(r.variantId);
  }
  await refreshStockFlags(tx, touched);
  return touched.length;
}

/** Put sold units back on the shelf (cancellation after commit, or a restockable return). */
export async function restockSold(tx: TxClient, variantId: string, quantity: number, type: "RETURN" | "CORRECTION", refType: string, refId: string, reason?: string) {
  if (quantity <= 0) return;
  const rows = await tx.$queryRaw<InvRow[]>`
    UPDATE "Inventory" SET quantity = quantity + ${quantity}, sold = GREATEST(sold - ${quantity}, 0), "updatedAt" = now()
    WHERE "variantId" = ${variantId} RETURNING quantity, reserved`;
  if (rows[0]) await logMovement(tx, { variantId, type, quantityDelta: quantity, reservedDelta: 0, after: rows[0], reason, refType, refId });
  await refreshStockFlags(tx, [variantId]);
}

export interface AdjustInput {
  variantId: string;
  /** Signed change in on-hand units. */
  delta: number;
  type?: Extract<StockMovementType, "ADJUSTMENT" | "DAMAGE" | "CORRECTION" | "RESTOCK">;
  reason: string;
}

/** Manual stock change by staff. Cannot take on-hand below reserved units. */
export async function adjustStock(actor: AuthUser, input: AdjustInput) {
  return withTransaction(async (tx) => {
    const rows = await tx.$queryRaw<InvRow[]>`
      UPDATE "Inventory" SET quantity = quantity + ${input.delta}, "updatedAt" = now()
      WHERE "variantId" = ${input.variantId} AND quantity + ${input.delta} >= reserved AND quantity + ${input.delta} >= 0
      RETURNING quantity, reserved`;
    if (rows.length === 0) {
      const inv = await tx.inventory.findUnique({ where: { variantId: input.variantId } });
      if (!inv) throw new AppError("VARIANT_NOT_FOUND", "Variant not found");
      throw new AppError("INVALID_STOCK_ADJUSTMENT", "Adjustment would drop stock below zero or below reserved units", { onHand: inv.quantity, reserved: inv.reserved });
    }
    await logMovement(tx, { variantId: input.variantId, type: input.type ?? "ADJUSTMENT", quantityDelta: input.delta, reservedDelta: 0, after: rows[0]!, reason: input.reason, refType: "manual", actorId: actor.id });
    await refreshStockFlags(tx, [input.variantId]);
    await audit({ action: "inventory.adjusted", resourceType: "variant", resourceId: input.variantId, actor, metadata: { delta: input.delta, reason: input.reason, after: rows[0] } }, tx);
    return { variantId: input.variantId, onHand: rows[0]!.quantity, reserved: rows[0]!.reserved, available: rows[0]!.quantity - rows[0]!.reserved };
  });
}

/** Record a supplier receipt: one RESTOCK movement per line + a receipt document. */
export async function receiveStock(actor: AuthUser, input: { reference: string; supplier?: string; note?: string; items: Array<{ variantId: string; quantity: number; unitCost?: number }> }) {
  return withTransaction(async (tx) => {
    const exists = await tx.stockReceipt.findUnique({ where: { reference: input.reference } });
    if (exists) throw new AppError("CONFLICT", "A receipt with this reference already exists");
    const receipt = await tx.stockReceipt.create({
      data: {
        reference: input.reference,
        supplier: input.supplier,
        note: input.note,
        actorId: actor.id,
        items: { create: input.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitCost: i.unitCost })) },
      },
    });
    for (const item of [...input.items].sort(byVariant)) {
      const rows = await tx.$queryRaw<InvRow[]>`
        UPDATE "Inventory" SET quantity = quantity + ${item.quantity}, "updatedAt" = now() WHERE "variantId" = ${item.variantId} RETURNING quantity, reserved`;
      if (rows.length === 0) throw new AppError("VARIANT_NOT_FOUND", "Variant not found", { variantId: item.variantId });
      await logMovement(tx, { variantId: item.variantId, type: "RESTOCK", quantityDelta: item.quantity, reservedDelta: 0, after: rows[0]!, reason: `Receipt ${input.reference}`, refType: "receipt", refId: receipt.id, actorId: actor.id });
    }
    await refreshStockFlags(tx, input.items.map((i) => i.variantId));
    await audit({ action: "inventory.received", resourceType: "stock_receipt", resourceId: receipt.id, actor, metadata: { reference: input.reference, lines: input.items.length } }, tx);
    return receipt;
  });
}

/** Release reservations whose payment window elapsed and cancel their unpaid orders. Safe to run from cron / on a schedule. */
export async function expireStaleReservations(now = new Date()) {
  const stale = await db.stockReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now }, order: { status: "PENDING_PAYMENT" } },
    select: { orderId: true },
    distinct: ["orderId"],
    take: 200,
  });
  let released = 0;
  for (const { orderId } of stale) {
    await withTransaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, userId: true } });
      if (!order || order.status !== "PENDING_PAYMENT") return;
      await releaseReservation(tx, orderId, "Payment window expired", "EXPIRED");
      await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: now, cancelReason: "Payment not completed in time", paymentStatus: "FAILED" } });
      await tx.orderStatusHistory.create({ data: { orderId, fromStatus: "PENDING_PAYMENT", toStatus: "CANCELLED", note: "Reservation expired" } });
      await tx.trackingEvent.create({ data: { orderId, code: "CANCELLED", title: "Order cancelled", description: "Payment was not completed in time." } });
      await tx.couponRedemption.updateMany({ where: { orderId, releasedAt: null }, data: { releasedAt: now } });
      released++;
    });
  }
  return { released };
}

export async function lowStock(limit = 50) {
  return db.$queryRaw<Array<{ variantId: string; sku: string; productId: string; productName: string; quantity: number; reserved: number; threshold: number }>>`
    SELECT i."variantId", v.sku, p.id AS "productId", p.name AS "productName", i.quantity, i.reserved, i."lowStockThreshold" AS threshold
    FROM "Inventory" i
    JOIN "ProductVariant" v ON v.id = i."variantId" AND v."isActive"
    JOIN "Product" p ON p.id = v."productId" AND p."deletedAt" IS NULL AND p.status <> 'ARCHIVED'
    WHERE i.quantity - i.reserved <= i."lowStockThreshold"
    ORDER BY (i.quantity - i.reserved) ASC, p.name ASC
    LIMIT ${limit}`;
}
