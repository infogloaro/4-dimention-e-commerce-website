import { db, Prisma } from "../db/client";
import { notFound } from "../core/errors";
import { audit } from "./audit";
import { refreshStockFlags } from "./inventory";
import type { AuthUser } from "../auth/session";
import type { StockMovementType } from "../db/generated/client";

export async function listInventory(q: { search?: string; lowStockOnly?: boolean; page: number; pageSize: number }) {
  const search = q.search ? `%${q.search.replace(/[\\%_]/g, "\\$&")}%` : null;
  const low = q.lowStockOnly ?? false;
  const rows = await db.$queryRaw<Array<{ variantId: string; sku: string; variantName: string | null; productId: string; productName: string; quantity: number; reserved: number; sold: number; threshold: number; allowBackorder: boolean; price: number; status: string; total: number }>>`
    SELECT i."variantId", v.sku, v.name AS "variantName", p.id AS "productId", p.name AS "productName", i.quantity, i.reserved, i.sold,
           i."lowStockThreshold" AS threshold, i."allowBackorder", v.price, p.status::text AS status, count(*) OVER ()::int AS total
    FROM "Inventory" i JOIN "ProductVariant" v ON v.id = i."variantId" JOIN "Product" p ON p.id = v."productId" AND p."deletedAt" IS NULL
    WHERE (${search}::text IS NULL OR p.name ILIKE ${search} OR v.sku ILIKE ${search})
      AND (NOT ${low} OR i.quantity - i.reserved <= i."lowStockThreshold")
    ORDER BY (i.quantity - i.reserved) ASC, p.name ASC
    LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;
  return { total: rows[0]?.total ?? 0, items: rows.map(({ total: _t, ...r }) => ({ ...r, available: r.quantity - r.reserved, isLow: r.quantity - r.reserved <= r.threshold })) };
}

export async function listMovements(q: { variantId?: string; type?: StockMovementType; page: number; pageSize: number }) {
  const where: Prisma.StockMovementWhereInput = { ...(q.variantId ? { variantId: q.variantId } : {}), ...(q.type ? { type: q.type } : {}) };
  const [items, total] = await Promise.all([
    db.stockMovement.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { variant: { select: { sku: true, product: { select: { name: true } } } } } }),
    db.stockMovement.count({ where }),
  ]);
  return { total, items: items.map(({ variant, ...m }) => ({ ...m, sku: variant.sku, productName: variant.product.name })) };
}

export async function updateStockSettings(actor: AuthUser, variantId: string, patch: { lowStockThreshold?: number; allowBackorder?: boolean }) {
  const cur = await db.inventory.findUnique({ where: { variantId } });
  if (!cur) throw notFound("VARIANT_NOT_FOUND", "Inventory record");
  const inv = await db.inventory.update({ where: { variantId }, data: patch });
  await refreshStockFlags(db, [variantId]);
  await audit({ action: "inventory.settings_changed", resourceType: "variant", resourceId: variantId, actor, metadata: { from: { lowStockThreshold: cur.lowStockThreshold, allowBackorder: cur.allowBackorder }, to: patch } });
  return inv;
}
