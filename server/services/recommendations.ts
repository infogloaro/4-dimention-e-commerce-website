import { db } from "../db/client";
import { memo } from "../core/cache";
import { hashToken } from "../core/crypto";
import { notFound } from "../core/errors";
import { cardInclude, toCard, type ProductCard } from "./catalog/dto";

/**
 * Rule-based recommendations behind a stable interface. Each strategy returns product cards; swapping one for an
 * ML/vector-based implementation later does not change any route or response shape.
 */
const LIVE = { status: "ACTIVE" as const, deletedAt: null };
const VIEW_RETENTION = 30;

export interface ViewerKey {
  userId?: string | null;
  guestToken?: string | null; // raw
}

async function cardsByIds(ids: string[]): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const rows = await db.product.findMany({ where: { id: { in: ids }, ...LIVE }, include: cardInclude });
  const pos = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => pos.get(a.id)! - pos.get(b.id)!).map(toCard);
}

export async function recordView(productId: string, viewer: ViewerKey) {
  const exists = await db.product.findFirst({ where: { id: productId, ...LIVE }, select: { id: true } });
  if (!exists) throw notFound("PRODUCT_NOT_FOUND", "Product");
  void db.product.update({ where: { id: productId }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
  if (viewer.userId) {
    await db.recentlyViewed.upsert({ where: { userId_productId: { userId: viewer.userId, productId } }, create: { userId: viewer.userId, productId }, update: { viewCount: { increment: 1 }, viewedAt: new Date() } });
    await trim({ userId: viewer.userId });
  } else if (viewer.guestToken) {
    const guestToken = hashToken(viewer.guestToken);
    await db.recentlyViewed.upsert({ where: { guestToken_productId: { guestToken, productId } }, create: { guestToken, productId }, update: { viewCount: { increment: 1 }, viewedAt: new Date() } });
    await trim({ guestToken });
  }
}

async function trim(where: { userId: string } | { guestToken: string }) {
  const stale = await db.recentlyViewed.findMany({ where, orderBy: { viewedAt: "desc" }, skip: VIEW_RETENTION, select: { id: true } });
  if (stale.length) await db.recentlyViewed.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
}

function viewerWhere(viewer: ViewerKey) {
  if (viewer.userId) return { userId: viewer.userId };
  if (viewer.guestToken) return { guestToken: hashToken(viewer.guestToken) };
  return null;
}

export async function recentlyViewed(viewer: ViewerKey, limit = 12, excludeProductId?: string) {
  const where = viewerWhere(viewer);
  if (!where) return [];
  const rows = await db.recentlyViewed.findMany({ where: { ...where, ...(excludeProductId ? { NOT: { productId: excludeProductId } } : {}) }, orderBy: { viewedAt: "desc" }, take: limit, select: { productId: true } });
  return cardsByIds(rows.map((r) => r.productId));
}

export async function clearRecentlyViewed(viewer: ViewerKey) {
  const where = viewerWhere(viewer);
  if (where) await db.recentlyViewed.deleteMany({ where });
}

async function baseProduct(productId: string) {
  const p = await db.product.findFirst({ where: { id: productId, ...LIVE }, select: { id: true, categoryId: true, brandId: true, minPrice: true, tags: { select: { tagId: true } } } });
  if (!p) throw notFound("PRODUCT_NOT_FOUND", "Product");
  return p;
}

/** Editor-curated relations first, then same category scored by brand / tag overlap / popularity. */
export async function related(productId: string, limit = 10) {
  const p = await baseProduct(productId);
  const manual = await db.productRelation.findMany({ where: { productId, type: "RELATED" }, orderBy: { sortOrder: "asc" }, take: limit, select: { relatedProductId: true } });
  const picked = manual.map((m) => m.relatedProductId);
  if (picked.length < limit) {
    const tagIds = new Set(p.tags.map((t) => t.tagId));
    const pool = await db.product.findMany({ where: { ...LIVE, categoryId: p.categoryId, NOT: { id: { in: [productId, ...picked] } } }, orderBy: { soldCount: "desc" }, take: 40, select: { id: true, brandId: true, soldCount: true, ratingAvg: true, tags: { select: { tagId: true } } } });
    const scored = pool
      .map((c) => ({ id: c.id, score: (c.brandId && c.brandId === p.brandId ? 3 : 0) + c.tags.filter((t) => tagIds.has(t.tagId)).length * 2 + Number(c.ratingAvg) / 5 + Math.log1p(c.soldCount) * 0.1 }))
      .sort((a, b) => b.score - a.score);
    picked.push(...scored.slice(0, limit - picked.length).map((s) => s.id));
  }
  return cardsByIds(picked);
}

/** Comparable alternatives: same category, similar price band. */
export async function similar(productId: string, limit = 10) {
  const p = await baseProduct(productId);
  const rows = await db.product.findMany({
    where: { ...LIVE, categoryId: p.categoryId, NOT: { id: productId }, minPrice: { gte: Math.floor(p.minPrice * 0.6), lte: Math.ceil(p.minPrice * 1.4) } },
    orderBy: [{ ratingAvg: "desc" }, { soldCount: "desc" }],
    take: limit,
    select: { id: true },
  });
  return cardsByIds(rows.map((r) => r.id));
}

export async function frequentlyBoughtTogether(productId: string, limit = 4) {
  await baseProduct(productId);
  const rows = await db.$queryRaw<Array<{ productId: string; n: number }>>`
    SELECT oi2."productId", count(*)::int AS n
    FROM "OrderItem" oi1
    JOIN "OrderItem" oi2 ON oi2."orderId" = oi1."orderId" AND oi2."productId" <> oi1."productId" AND oi2."productId" IS NOT NULL
    JOIN "Order" o ON o.id = oi1."orderId" AND o.status NOT IN ('CANCELLED', 'FAILED', 'PENDING_PAYMENT')
    WHERE oi1."productId" = ${productId}
    GROUP BY oi2."productId" ORDER BY n DESC LIMIT ${limit}`;
  let ids = rows.map((r) => r.productId);
  if (ids.length < limit) {
    const manual = await db.productRelation.findMany({ where: { productId, type: { in: ["ACCESSORY", "UPSELL"] } }, orderBy: { sortOrder: "asc" }, take: limit, select: { relatedProductId: true } });
    ids = [...new Set([...ids, ...manual.map((m) => m.relatedProductId)])].slice(0, limit);
  }
  return cardsByIds(ids);
}

export function trending(limit = 12) {
  return memo(`reco:trending:${limit}`, 5 * 60_000, async () => {
    const rows = await db.$queryRaw<Array<{ productId: string; n: number }>>`
      SELECT oi."productId", sum(oi.quantity)::int AS n
      FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId" AND o.status NOT IN ('CANCELLED', 'FAILED', 'PENDING_PAYMENT')
      JOIN "Product" p ON p.id = oi."productId" AND p.status = 'ACTIVE' AND p."deletedAt" IS NULL
      WHERE o."createdAt" > now() - interval '30 days' AND oi."productId" IS NOT NULL
      GROUP BY oi."productId" ORDER BY n DESC LIMIT ${limit}`;
    let ids = rows.map((r) => r.productId);
    if (ids.length < limit) {
      const fill = await db.product.findMany({ where: { ...LIVE, NOT: { id: { in: ids } } }, orderBy: [{ soldCount: "desc" }, { viewCount: "desc" }], take: limit - ids.length, select: { id: true } });
      ids = [...ids, ...fill.map((f) => f.id)];
    }
    return cardsByIds(ids);
  });
}

/** "Based on your browsing": products from categories/brands the viewer looked at, excluding what they already viewed. */
export async function personalized(viewer: ViewerKey, limit = 12) {
  const where = viewerWhere(viewer);
  const seen = where ? await db.recentlyViewed.findMany({ where, orderBy: { viewedAt: "desc" }, take: VIEW_RETENTION, select: { productId: true, product: { select: { categoryId: true, brandId: true } } } }) : [];
  if (seen.length === 0) return { strategy: "trending" as const, items: await trending(limit) };
  const cats = [...new Set(seen.map((s) => s.product.categoryId))];
  const brands = [...new Set(seen.map((s) => s.product.brandId).filter((b): b is string => !!b))];
  const rows = await db.product.findMany({
    where: { ...LIVE, inStock: true, NOT: { id: { in: seen.map((s) => s.productId) } }, OR: [{ categoryId: { in: cats } }, ...(brands.length ? [{ brandId: { in: brands } }] : [])] },
    orderBy: [{ ratingAvg: "desc" }, { soldCount: "desc" }],
    take: limit,
    select: { id: true },
  });
  if (rows.length === 0) return { strategy: "trending" as const, items: await trending(limit) };
  return { strategy: "browsing" as const, items: await cardsByIds(rows.map((r) => r.id)) };
}

export async function productIdBySlug(slug: string) {
  const p = await db.product.findFirst({ where: { slug, ...LIVE }, select: { id: true } });
  if (!p) throw notFound("PRODUCT_NOT_FOUND", "Product");
  return p.id;
}
