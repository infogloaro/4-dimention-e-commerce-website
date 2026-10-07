import { db, withTransaction, type Db, type TxClient } from "../../db/client";
import { AppError, notFound } from "../../core/errors";
import { invalidate } from "../../core/cache";
import { slugify } from "../../core/text";
import { audit } from "../audit";
import { refreshStockFlags } from "../inventory";
import { assertElectronicsProduct, validateElectronicsAttributes } from "../../domain/electronics-policy";
import type { AuthUser } from "../../auth/session";
import type { z } from "zod";
import type { createProductBody, updateProductBody, variantInput, mediaInput } from "../../validation/catalog";

type CreateInput = z.output<typeof createProductBody>;
type UpdateInput = z.output<typeof updateProductBody>;
type VariantInput = z.output<typeof variantInput>;
type MediaInput = z.output<typeof mediaInput>;

async function uniqueSlug(tx: Db, base: string, ignoreId?: string): Promise<string> {
  const root = slugify(base) || "product";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await tx.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!clash || clash.id === ignoreId) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

async function ensureAttribute(tx: Db, a: { key: string; name?: string; kind: "VARIANT_OPTION" | "SPECIFICATION"; group?: string; unit?: string; filterable?: boolean }) {
  const existing = await tx.attribute.findUnique({ where: { key: a.key } });
  if (existing) return existing;
  return tx.attribute.create({
    data: { key: a.key, name: a.name ?? a.key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), kind: a.kind, group: a.group, unit: a.unit, isFilterable: a.filterable ?? a.kind === "VARIANT_OPTION" },
  });
}

async function writeVariant(tx: TxClient, productId: string, v: VariantInput, actorId: string) {
  const clash = await tx.productVariant.findUnique({ where: { sku: v.sku }, select: { id: true } });
  if (clash) throw new AppError("SKU_TAKEN", `SKU ${v.sku} is already in use`, { sku: v.sku });
  if (v.compareAtPrice != null && v.compareAtPrice < v.price) throw new AppError("VALIDATION_ERROR", "compareAtPrice must be ≥ price", { sku: v.sku });
  const variant = await tx.productVariant.create({
    data: { productId, sku: v.sku, name: v.name, barcode: v.barcode, price: v.price, compareAtPrice: v.compareAtPrice ?? null, costPrice: v.costPrice ?? null, weightGrams: v.weightGrams, taxRateBps: v.taxRateBps ?? null, isDefault: v.isDefault ?? false, isActive: v.isActive, sortOrder: v.sortOrder },
  });
  for (const o of v.options) {
    const attr = await ensureAttribute(tx, { key: o.key, name: o.name, kind: "VARIANT_OPTION" });
    await tx.variantOptionValue.create({ data: { variantId: variant.id, attributeId: attr.id, value: o.value, swatch: o.swatch } });
  }
  await tx.inventory.create({ data: { variantId: variant.id, quantity: v.stock.quantity, lowStockThreshold: v.stock.lowStockThreshold, allowBackorder: v.stock.allowBackorder } });
  if (v.stock.quantity > 0) {
    await tx.stockMovement.create({ data: { variantId: variant.id, type: "RESTOCK", quantityDelta: v.stock.quantity, quantityAfter: v.stock.quantity, reservedAfter: 0, reason: "Initial stock", refType: "product_create", actorId } });
  }
  return variant;
}

async function replaceMedia(tx: TxClient, productId: string, media: MediaInput[]) {
  await tx.productMedia.deleteMany({ where: { productId } });
  if (!media.length) return;
  const variants = await tx.productVariant.findMany({ where: { productId }, select: { id: true, sku: true } });
  const bySku = new Map(variants.map((v) => [v.sku, v.id]));
  const hasPrimary = media.some((m) => m.isPrimary && !m.variantSku);
  let primaryAssigned = false;
  for (const [i, m] of media.entries()) {
    const variantId = m.variantSku ? bySku.get(m.variantSku) : undefined;
    if (m.variantSku && !variantId) throw new AppError("VARIANT_NOT_FOUND", `Unknown variant SKU ${m.variantSku} in media`);
    const isPrimary = !variantId && (hasPrimary ? !!m.isPrimary && !primaryAssigned : !primaryAssigned && m.type === "IMAGE");
    if (isPrimary) primaryAssigned = true;
    await tx.productMedia.create({
      data: { productId, variantId, type: m.type, url: m.url, thumbnailUrl: m.thumbnailUrl, alt: m.alt, width: m.width, height: m.height, durationSec: m.durationSec, isPrimary, sortOrder: m.sortOrder || i },
    });
  }
}

async function replaceAttributes(tx: TxClient, productId: string, attrs: CreateInput["attributes"]) {
  await tx.productAttributeValue.deleteMany({ where: { productId } });
  for (const [i, a] of attrs.entries()) {
    const attr = await ensureAttribute(tx, { key: a.key, name: a.name, kind: "SPECIFICATION", group: a.group, unit: a.unit, filterable: a.filterable });
    await tx.productAttributeValue.upsert({ where: { productId_attributeId: { productId, attributeId: attr.id } }, create: { productId, attributeId: attr.id, value: a.value, sortOrder: i }, update: { value: a.value, sortOrder: i } });
  }
}

async function replaceTags(tx: TxClient, productId: string, names: string[]) {
  await tx.productTag.deleteMany({ where: { productId } });
  for (const name of [...new Set(names.map((n) => n.trim()).filter(Boolean))]) {
    const slug = slugify(name);
    if (!slug) continue;
    const tag = await tx.tag.upsert({ where: { slug }, create: { name, slug }, update: {} });
    await tx.productTag.create({ data: { productId, tagId: tag.id } });
  }
}

/**
 * Recompute the denormalised read-model of a product (price range, discount, stock flag) and its search text.
 * Called after every write that can change them, inside the same transaction.
 */
export async function reindexProduct(tx: Db, productId: string) {
  const p = await tx.product.findUnique({
    where: { id: productId },
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true, path: true } },
      tags: { select: { tag: { select: { name: true } } } },
      attributes: { select: { value: true } },
      variants: { where: { isActive: true }, select: { sku: true, price: true, compareAtPrice: true, name: true, options: { select: { value: true } } } },
    },
  });
  if (!p) return;
  const prices = p.variants.map((v) => v.price);
  const maxDiscountPct = p.variants.reduce((m, v) => (v.compareAtPrice && v.compareAtPrice > v.price ? Math.max(m, Math.round(((v.compareAtPrice - v.price) / v.compareAtPrice) * 100)) : m), 0);
  const categoryNames = await categoryChainNames(tx, p.categoryId);
  const searchText = [p.name, p.brand?.name, ...categoryNames, p.shortDescription, ...p.highlights, ...p.tags.map((t) => t.tag.name), ...p.attributes.map((a) => a.value), ...p.variants.flatMap((v) => [v.sku, v.name, ...v.options.map((o) => o.value)])]
    .filter((x): x is string => !!x)
    .join(" ")
    .toLowerCase()
    .slice(0, 4000);
  await tx.product.update({ where: { id: productId }, data: { minPrice: prices.length ? Math.min(...prices) : 0, maxPrice: prices.length ? Math.max(...prices) : 0, maxDiscountPct, searchText } });
  await refreshStockFlags(tx, p.variants.length ? (await tx.productVariant.findMany({ where: { productId }, select: { id: true }, take: 1 })).map((v) => v.id) : []);
}

async function categoryChainNames(tx: Db, categoryId: string): Promise<string[]> {
  const names: string[] = [];
  for (let id: string | null = categoryId, n = 0; id && n < 8; n++) {
    const c: { name: string; parentId: string | null } | null = await tx.category.findUnique({ where: { id }, select: { name: true, parentId: true } });
    if (!c) break;
    names.push(c.name);
    id = c.parentId;
  }
  return names;
}

function productData(input: Partial<UpdateInput> & Partial<CreateInput>) {
  return {
    name: input.name,
    shortDescription: input.shortDescription,
    description: input.description,
    status: input.status,
    brandId: input.brandId,
    categoryId: input.categoryId,
    productType: input.productType,
    taxRateBps: input.taxRatePercent != null ? Math.round(input.taxRatePercent * 100) : undefined,
    hsnCode: input.hsnCode,
    maxQuantityPerOrder: input.maxQuantityPerOrder,
    isFeatured: input.isFeatured,
    isBestseller: input.isBestseller,
    isNewArrival: input.isNewArrival,
    badges: input.badges,
    highlights: input.highlights,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    seoKeywords: input.seoKeywords,
    ogImageUrl: input.ogImageUrl,
    canonicalUrl: input.canonicalUrl,
  };
}

async function assertRefs(tx: Db, categoryId?: string, brandId?: string | null) {
  if (categoryId && !(await tx.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) throw notFound("CATEGORY_NOT_FOUND", "Category");
  if (brandId && !(await tx.brand.findUnique({ where: { id: brandId }, select: { id: true } }))) throw notFound("BRAND_NOT_FOUND", "Brand");
}

export async function createProduct(actor: AuthUser, input: CreateInput) {
  assertElectronicsProduct(input.name, input.description, input.tags);
  if (input.attributes) validateElectronicsAttributes(input.attributes);
  const skus = input.variants.map((v) => v.sku.toLowerCase());
  if (new Set(skus).size !== skus.length) throw new AppError("SKU_TAKEN", "Duplicate SKUs in request");
  const result = await withTransaction(async (tx) => {
    await assertRefs(tx, input.categoryId, input.brandId);
    const slug = input.slug ? input.slug : await uniqueSlug(tx, input.name);
    if (input.slug && (await tx.product.findUnique({ where: { slug }, select: { id: true } }))) throw new AppError("SLUG_TAKEN", "Slug already in use");
    const product = await tx.product.create({ data: { ...productData(input), name: input.name, categoryId: input.categoryId, slug, publishedAt: input.status === "ACTIVE" ? new Date() : null } });
    const hasDefault = input.variants.some((v) => v.isDefault);
    for (const [i, v] of input.variants.entries()) await writeVariant(tx, product.id, { ...v, isDefault: hasDefault ? v.isDefault : i === 0, sortOrder: v.sortOrder || i }, actor.id);
    await replaceAttributes(tx, product.id, input.attributes);
    await replaceTags(tx, product.id, input.tags);
    await replaceMedia(tx, product.id, input.media);
    await reindexProduct(tx, product.id);
    await audit({ action: "product.created", resourceType: "product", resourceId: product.id, actor, metadata: { name: input.name, variants: input.variants.length } }, tx);
    return product;
  });
  invalidate("categories:");
  invalidate("listing:");
  return { id: result.id, slug: result.slug };
}

export async function updateProduct(actor: AuthUser, id: string, input: UpdateInput) {
  if (input.name) assertElectronicsProduct(input.name, input.description, input.tags);
  if (input.attributes) validateElectronicsAttributes(input.attributes);
  await withTransaction(async (tx) => {
    const current = await tx.product.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound("PRODUCT_NOT_FOUND", "Product");
    await assertRefs(tx, input.categoryId, input.brandId);
    let slug: string | undefined;
    if (input.slug && input.slug !== current.slug) {
      if (await tx.product.findUnique({ where: { slug: input.slug }, select: { id: true } })) throw new AppError("SLUG_TAKEN", "Slug already in use");
      slug = input.slug;
    }
    const publishing = input.status === "ACTIVE" && current.status !== "ACTIVE";
    await tx.product.update({ where: { id }, data: { ...productData(input), slug, ...(publishing && !current.publishedAt ? { publishedAt: new Date() } : {}) } });
    if (input.attributes) await replaceAttributes(tx, id, input.attributes);
    if (input.tags) await replaceTags(tx, id, input.tags);
    if (input.media) await replaceMedia(tx, id, input.media);
    await reindexProduct(tx, id);
    const changed = Object.keys(input).filter((k) => input[k as keyof UpdateInput] !== undefined);
    await audit({ action: input.status && input.status !== current.status ? "product.status_changed" : "product.updated", resourceType: "product", resourceId: id, actor, metadata: { fields: changed, ...(input.status ? { from: current.status, to: input.status } : {}) } }, tx);
  });
  invalidate("categories:");
}

export async function addVariant(actor: AuthUser, productId: string, v: VariantInput) {
  const out = await withTransaction(async (tx) => {
    if (!(await tx.product.findFirst({ where: { id: productId, deletedAt: null }, select: { id: true } }))) throw notFound("PRODUCT_NOT_FOUND", "Product");
    const variant = await writeVariant(tx, productId, v, actor.id);
    await reindexProduct(tx, productId);
    await audit({ action: "variant.created", resourceType: "variant", resourceId: variant.id, actor, metadata: { sku: v.sku, price: v.price } }, tx);
    return variant;
  });
  return { id: out.id, sku: out.sku };
}

export async function updateVariant(actor: AuthUser, variantId: string, patch: { price?: number; compareAtPrice?: number | null; costPrice?: number | null; name?: string; isActive?: boolean; isDefault?: boolean; weightGrams?: number; taxRateBps?: number | null; barcode?: string; sortOrder?: number }) {
  await withTransaction(async (tx) => {
    const cur = await tx.productVariant.findUnique({ where: { id: variantId } });
    if (!cur) throw notFound("VARIANT_NOT_FOUND", "Variant");
    const price = patch.price ?? cur.price;
    const compare = patch.compareAtPrice === undefined ? cur.compareAtPrice : patch.compareAtPrice;
    if (compare != null && compare < price) throw new AppError("VALIDATION_ERROR", "compareAtPrice must be ≥ price");
    if (patch.isDefault) await tx.productVariant.updateMany({ where: { productId: cur.productId, isDefault: true, NOT: { id: variantId } }, data: { isDefault: false } });
    await tx.productVariant.update({ where: { id: variantId }, data: patch });
    await reindexProduct(tx, cur.productId);
    if (patch.price != null && patch.price !== cur.price) {
      await audit({ action: "product.price_changed", resourceType: "variant", resourceId: variantId, actor, metadata: { sku: cur.sku, from: cur.price, to: patch.price } }, tx);
    } else {
      await audit({ action: "variant.updated", resourceType: "variant", resourceId: variantId, actor, metadata: { fields: Object.keys(patch) } }, tx);
    }
  });
}

/** Variants that were ever ordered are deactivated, never hard-deleted, so order history keeps its references. */
export async function removeVariant(actor: AuthUser, variantId: string) {
  await withTransaction(async (tx) => {
    const v = await tx.productVariant.findUnique({ where: { id: variantId }, include: { _count: { select: { orderItems: true } } } });
    if (!v) throw notFound("VARIANT_NOT_FOUND", "Variant");
    const siblings = await tx.productVariant.count({ where: { productId: v.productId, isActive: true, NOT: { id: variantId } } });
    if (siblings === 0) throw new AppError("CONFLICT", "A product needs at least one active variant — archive the product instead");
    if (v._count.orderItems > 0) await tx.productVariant.update({ where: { id: variantId }, data: { isActive: false, isDefault: false } });
    else await tx.productVariant.delete({ where: { id: variantId } });
    if (v.isDefault) {
      const next = await tx.productVariant.findFirst({ where: { productId: v.productId, isActive: true }, orderBy: { sortOrder: "asc" } });
      if (next) await tx.productVariant.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    await reindexProduct(tx, v.productId);
    await audit({ action: "variant.removed", resourceType: "variant", resourceId: variantId, actor, metadata: { sku: v.sku, soft: v._count.orderItems > 0 } }, tx);
  });
}

export async function archiveProduct(actor: AuthUser, id: string) {
  await withTransaction(async (tx) => {
    const p = await tx.product.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw notFound("PRODUCT_NOT_FOUND", "Product");
    await tx.product.update({ where: { id }, data: { status: "ARCHIVED", deletedAt: new Date() } });
    await tx.cartItem.deleteMany({ where: { variant: { productId: id } } });
    await audit({ action: "product.deleted", resourceType: "product", resourceId: id, actor, metadata: { name: p.name } }, tx);
  });
  invalidate("categories:");
}

export async function bulkUpdateProducts(actor: AuthUser, input: { ids: string[]; action: string; categoryId?: string; percent?: number }) {
  const ids = [...new Set(input.ids)];
  const affected = await withTransaction(async (tx) => {
    const where = { id: { in: ids }, deletedAt: null };
    let count = 0;
    switch (input.action) {
      case "publish":
        count = (await tx.product.updateMany({ where, data: { status: "ACTIVE", publishedAt: new Date() } })).count;
        break;
      case "unpublish":
        count = (await tx.product.updateMany({ where, data: { status: "DRAFT" } })).count;
        break;
      case "archive":
        count = (await tx.product.updateMany({ where, data: { status: "ARCHIVED", deletedAt: new Date() } })).count;
        break;
      case "feature":
      case "unfeature":
        count = (await tx.product.updateMany({ where, data: { isFeatured: input.action === "feature" } })).count;
        break;
      case "set_category":
        if (!input.categoryId) throw new AppError("VALIDATION_ERROR", "categoryId is required");
        await assertRefs(tx, input.categoryId);
        count = (await tx.product.updateMany({ where, data: { categoryId: input.categoryId } })).count;
        for (const id of ids) await reindexProduct(tx, id);
        break;
      case "adjust_price_percent": {
        if (input.percent == null) throw new AppError("VALIDATION_ERROR", "percent is required");
        const factor = (1 + input.percent / 100).toFixed(4);
        await tx.$executeRaw`
          UPDATE "ProductVariant" SET price = GREATEST(round(price * ${factor}::numeric)::int, 0),
            "compareAtPrice" = CASE WHEN "compareAtPrice" IS NULL THEN NULL ELSE GREATEST(round("compareAtPrice" * ${factor}::numeric)::int, round(price * ${factor}::numeric)::int) END
          WHERE "productId" = ANY(${ids}::text[])`;
        count = ids.length;
        for (const id of ids) await reindexProduct(tx, id);
        break;
      }
      default:
        throw new AppError("BAD_REQUEST", "Unknown bulk action");
    }
    await audit({ action: `product.bulk_${input.action}`, resourceType: "product", actor, metadata: { ids, percent: input.percent, categoryId: input.categoryId, affected: count } }, tx);
    return count;
  });
  invalidate("categories:");
  return { affected };
}

/** Back-office list with search + status filter (includes drafts/archived, unlike the storefront). */
export async function adminListProducts(q: { search?: string; status?: string; categoryId?: string; page: number; pageSize: number; lowStock?: boolean }) {
  const where = {
    ...(q.status ? { status: q.status as "DRAFT" | "ACTIVE" | "ARCHIVED" } : { deletedAt: null }),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.search ? { OR: [{ name: { contains: q.search, mode: "insensitive" as const } }, { variants: { some: { sku: { contains: q.search, mode: "insensitive" as const } } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { id: true, name: true, slug: true, status: true, minPrice: true, maxPrice: true, inStock: true, soldCount: true, updatedAt: true, category: { select: { name: true } }, brand: { select: { name: true } }, media: { where: { isPrimary: true }, take: 1, select: { url: true } }, variants: { select: { id: true, sku: true, inventory: { select: { quantity: true, reserved: true } } } } },
    }),
    db.product.count({ where }),
  ]);
  return {
    total,
    items: rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, status: r.status, category: r.category.name, brand: r.brand?.name ?? null, image: r.media[0]?.url ?? null, minPrice: r.minPrice, maxPrice: r.maxPrice, inStock: r.inStock, soldCount: r.soldCount, variantCount: r.variants.length, skus: r.variants.map((v) => v.sku), stockOnHand: r.variants.reduce((s, v) => s + (v.inventory?.quantity ?? 0), 0), updatedAt: r.updatedAt })),
  };
}
