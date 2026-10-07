import { db, withTransaction, type TxClient } from "../../db/client";
import { AppError, notFound } from "../../core/errors";
import { invalidate } from "../../core/cache";
import { slugify } from "../../core/text";
import { audit } from "../audit";
import { reindexProduct } from "./admin-products";
import { assertElectronicsCategory } from "../../domain/electronics-policy";
import type { AuthUser } from "../../auth/session";

const bust = () => {
  invalidate("categories:");
  invalidate("brands:");
  invalidate("collections:");
};

// ───────────────────────────── categories ─────────────────────────────

export interface CategoryInput {
  name?: string;
  slug?: string;
  parentId?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  iconName?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string[];
  ogImageUrl?: string | null;
  canonicalUrl?: string | null;
}

async function recomputePaths(tx: TxClient, id: string, parentPath: string, parentDepth: number) {
  const c = await tx.category.findUniqueOrThrow({ where: { id }, select: { slug: true } });
  const path = parentPath ? `${parentPath}/${c.slug}` : c.slug;
  const depth = parentPath ? parentDepth + 1 : 0;
  await tx.category.update({ where: { id }, data: { path, depth } });
  const kids = await tx.category.findMany({ where: { parentId: id }, select: { id: true } });
  for (const k of kids) await recomputePaths(tx, k.id, path, depth);
}

async function assertNoCycle(tx: TxClient, id: string, newParentId: string) {
  for (let cur: string | null = newParentId, n = 0; cur && n < 20; n++) {
    if (cur === id) throw new AppError("CATEGORY_CYCLE", "A category cannot be moved under itself or its descendants");
    cur = (await tx.category.findUnique({ where: { id: cur }, select: { parentId: true } }))?.parentId ?? null;
  }
}

export async function listAllCategories() {
  const rows = await db.category.findMany({ orderBy: [{ path: "asc" }], include: { _count: { select: { products: true, children: true } } } });
  return rows.map(({ _count, ...c }) => ({ ...c, productCount: _count.products, childCount: _count.children }));
}

export async function createCategory(actor: AuthUser, input: CategoryInput & { name: string }) {
  assertElectronicsCategory(input.name, input.slug);
  const cat = await withTransaction(async (tx) => {
    const slug = input.slug ?? slugify(input.name);
    if (await tx.category.findUnique({ where: { slug }, select: { id: true } })) throw new AppError("SLUG_TAKEN", "Slug already in use");
    const parent = input.parentId ? await tx.category.findUnique({ where: { id: input.parentId } }) : null;
    if (input.parentId && !parent) throw notFound("CATEGORY_NOT_FOUND", "Parent category");
    const c = await tx.category.create({ data: { ...input, name: input.name, slug, path: parent ? `${parent.path}/${slug}` : slug, depth: parent ? parent.depth + 1 : 0 } });
    await audit({ action: "category.created", resourceType: "category", resourceId: c.id, actor, metadata: { name: c.name } }, tx);
    return c;
  });
  bust();
  return cat;
}

export async function updateCategory(actor: AuthUser, id: string, input: CategoryInput) {
  if (input.name) assertElectronicsCategory(input.name, input.slug);
  const cat = await withTransaction(async (tx) => {
    const cur = await tx.category.findUnique({ where: { id } });
    if (!cur) throw notFound("CATEGORY_NOT_FOUND", "Category");
    if (input.slug && input.slug !== cur.slug && (await tx.category.findUnique({ where: { slug: input.slug }, select: { id: true } }))) throw new AppError("SLUG_TAKEN", "Slug already in use");
    const reparent = input.parentId !== undefined && input.parentId !== cur.parentId;
    if (reparent && input.parentId) await assertNoCycle(tx, id, input.parentId);
    const updated = await tx.category.update({ where: { id }, data: input });
    if (reparent || (input.slug && input.slug !== cur.slug)) {
      const parent = updated.parentId ? await tx.category.findUniqueOrThrow({ where: { id: updated.parentId } }) : null;
      await recomputePaths(tx, id, parent?.path ?? "", parent?.depth ?? -1);
      // search text embeds category names — refresh affected products
      const affected = await tx.product.findMany({ where: { category: { OR: [{ id }, { path: { startsWith: `${updated.path}/` } }] } }, select: { id: true }, take: 2000 });
      for (const p of affected) await reindexProduct(tx, p.id);
    } else if (input.name && input.name !== cur.name) {
      const affected = await tx.product.findMany({ where: { categoryId: id }, select: { id: true }, take: 2000 });
      for (const p of affected) await reindexProduct(tx, p.id);
    }
    await audit({ action: "category.updated", resourceType: "category", resourceId: id, actor, metadata: { fields: Object.keys(input) } }, tx);
    return tx.category.findUniqueOrThrow({ where: { id } });
  });
  bust();
  return cat;
}

export async function deleteCategory(actor: AuthUser, id: string) {
  await withTransaction(async (tx) => {
    const c = await tx.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
    if (!c) throw notFound("CATEGORY_NOT_FOUND", "Category");
    if (c._count.children > 0 || c._count.products > 0) throw new AppError("CATEGORY_NOT_EMPTY", "Move or archive its subcategories and products first", { children: c._count.children, products: c._count.products });
    await tx.category.delete({ where: { id } });
    await audit({ action: "category.deleted", resourceType: "category", resourceId: id, actor, metadata: { name: c.name } }, tx);
  });
  bust();
}

/** Persist drag-and-drop ordering: ids in the new order within one parent. */
export async function reorderCategories(actor: AuthUser, items: Array<{ id: string; sortOrder: number }>) {
  await withTransaction(async (tx) => {
    for (const i of items) await tx.category.update({ where: { id: i.id }, data: { sortOrder: i.sortOrder } });
    await audit({ action: "category.reordered", resourceType: "category", actor, metadata: { count: items.length } }, tx);
  });
  bust();
}

// ───────────────────────────── brands ─────────────────────────────

export interface BrandInput {
  name?: string;
  slug?: string;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  websiteUrl?: string | null;
  isActive?: boolean;
  isFeatured?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string[];
  ogImageUrl?: string | null;
}

export const listAllBrands = () => db.brand.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } });

export async function createBrand(actor: AuthUser, input: BrandInput & { name: string }) {
  const slug = input.slug ?? slugify(input.name);
  if (await db.brand.findUnique({ where: { slug }, select: { id: true } })) throw new AppError("SLUG_TAKEN", "Slug already in use");
  const b = await db.brand.create({ data: { ...input, name: input.name, slug } });
  await audit({ action: "brand.created", resourceType: "brand", resourceId: b.id, actor, metadata: { name: b.name } });
  bust();
  return b;
}

export async function updateBrand(actor: AuthUser, id: string, input: BrandInput) {
  const cur = await db.brand.findUnique({ where: { id } });
  if (!cur) throw notFound("BRAND_NOT_FOUND", "Brand");
  if (input.slug && input.slug !== cur.slug && (await db.brand.findUnique({ where: { slug: input.slug }, select: { id: true } }))) throw new AppError("SLUG_TAKEN", "Slug already in use");
  const b = await db.brand.update({ where: { id }, data: input });
  await audit({ action: "brand.updated", resourceType: "brand", resourceId: id, actor, metadata: { fields: Object.keys(input) } });
  bust();
  return b;
}

export async function deleteBrand(actor: AuthUser, id: string) {
  const b = await db.brand.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!b) throw notFound("BRAND_NOT_FOUND", "Brand");
  if (b._count.products > 0) throw new AppError("CONFLICT", "This brand still has products. Reassign them or mark the brand inactive.", { products: b._count.products });
  await db.brand.delete({ where: { id } });
  await audit({ action: "brand.deleted", resourceType: "brand", resourceId: id, actor, metadata: { name: b.name } });
  bust();
}

// ───────────────────────────── collections ─────────────────────────────

export interface CollectionInput {
  name?: string;
  slug?: string;
  description?: string | null;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  isActive?: boolean;
  isFeatured?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  sortOrder?: number;
  seoTitle?: string | null;
  seoDescription?: string | null;
  ogImageUrl?: string | null;
  productIds?: string[];
}

export const listAllCollections = () => db.collection.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } });

export async function createCollection(actor: AuthUser, input: CollectionInput & { name: string }) {
  const { productIds, ...data } = input;
  const slug = input.slug ?? slugify(input.name);
  if (await db.collection.findUnique({ where: { slug }, select: { id: true } })) throw new AppError("SLUG_TAKEN", "Slug already in use");
  const c = await db.collection.create({ data: { ...data, name: input.name, slug, ...(productIds?.length ? { products: { create: productIds.map((productId, i) => ({ productId, sortOrder: i })) } } : {}) } });
  await audit({ action: "collection.created", resourceType: "collection", resourceId: c.id, actor, metadata: { name: c.name } });
  bust();
  return c;
}

export async function updateCollection(actor: AuthUser, id: string, input: CollectionInput) {
  const { productIds, ...data } = input;
  const cur = await db.collection.findUnique({ where: { id } });
  if (!cur) throw notFound("COLLECTION_NOT_FOUND", "Collection");
  if (input.slug && input.slug !== cur.slug && (await db.collection.findUnique({ where: { slug: input.slug }, select: { id: true } }))) throw new AppError("SLUG_TAKEN", "Slug already in use");
  await withTransaction(async (tx) => {
    await tx.collection.update({ where: { id }, data });
    if (productIds) {
      await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
      if (productIds.length) await tx.collectionProduct.createMany({ data: productIds.map((productId, i) => ({ collectionId: id, productId, sortOrder: i })) });
    }
    await audit({ action: "collection.updated", resourceType: "collection", resourceId: id, actor, metadata: { fields: Object.keys(input) } }, tx);
  });
  bust();
  return db.collection.findUniqueOrThrow({ where: { id }, include: { products: { orderBy: { sortOrder: "asc" } } } });
}

export async function deleteCollection(actor: AuthUser, id: string) {
  const res = await db.collection.deleteMany({ where: { id } });
  if (res.count === 0) throw notFound("COLLECTION_NOT_FOUND", "Collection");
  await audit({ action: "collection.deleted", resourceType: "collection", resourceId: id, actor });
  bust();
}
