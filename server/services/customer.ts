import { db, withTransaction } from "../db/client";
import { AppError, notFound } from "../core/errors";
import { cardInclude, toCard } from "./catalog/dto";
import { addItem, type CartOwner } from "./cart";

// ───────────────────────────── addresses ─────────────────────────────

const MAX_ADDRESSES = 20;
export interface AddressInput {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  type: "HOME" | "WORK" | "OTHER";
  isDefault: boolean;
}

export const listAddresses = (userId: string) => db.address.findMany({ where: { userId, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });

export async function getAddress(userId: string, id: string) {
  const a = await db.address.findFirst({ where: { id, userId, deletedAt: null } });
  if (!a) throw notFound("ADDRESS_NOT_FOUND", "Address");
  return a;
}

export async function createAddress(userId: string, input: AddressInput) {
  return withTransaction(async (tx) => {
    const count = await tx.address.count({ where: { userId, deletedAt: null } });
    if (count >= MAX_ADDRESSES) throw new AppError("BAD_REQUEST", `You can save up to ${MAX_ADDRESSES} addresses`);
    const makeDefault = input.isDefault || count === 0;
    if (makeDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.address.create({ data: { ...input, userId, isDefault: makeDefault } });
  });
}

export async function updateAddress(userId: string, id: string, patch: Partial<AddressInput>) {
  return withTransaction(async (tx) => {
    const cur = await tx.address.findFirst({ where: { id, userId, deletedAt: null } });
    if (!cur) throw notFound("ADDRESS_NOT_FOUND", "Address");
    if (patch.isDefault) await tx.address.updateMany({ where: { userId, isDefault: true, NOT: { id } }, data: { isDefault: false } });
    return tx.address.update({ where: { id }, data: { ...patch, ...(patch.isDefault === false && cur.isDefault ? { isDefault: false } : {}) } });
  });
}

export async function setDefaultAddress(userId: string, id: string) {
  return updateAddress(userId, id, { isDefault: true });
}

export async function deleteAddress(userId: string, id: string) {
  await withTransaction(async (tx) => {
    const cur = await tx.address.findFirst({ where: { id, userId, deletedAt: null } });
    if (!cur) throw notFound("ADDRESS_NOT_FOUND", "Address");
    await tx.address.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
    if (cur.isDefault) {
      const next = await tx.address.findFirst({ where: { userId, deletedAt: null }, orderBy: { createdAt: "desc" } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
}

// ───────────────────────────── wishlist ─────────────────────────────

export async function listWishlist(userId: string) {
  const rows = await db.wishlistItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200, include: { product: { include: cardInclude } } });
  return rows
    .filter((r) => r.product.status === "ACTIVE" && !r.product.deletedAt)
    .map((r) => {
      const card = toCard(r.product);
      const nowPrice = card.price.min;
      return {
        id: r.id,
        addedAt: r.createdAt,
        variantId: r.variantId,
        product: card,
        availability: { inStock: card.inStock, stockStatus: card.stockStatus },
        priceWhenAdded: r.priceAtAdd,
        priceChange: r.priceAtAdd !== nowPrice ? { from: r.priceAtAdd, to: nowPrice, dropped: nowPrice < r.priceAtAdd } : null,
      };
    });
}

export async function addToWishlist(userId: string, input: { productId: string; variantId?: string }) {
  const p = await db.product.findFirst({ where: { id: input.productId, status: "ACTIVE", deletedAt: null }, select: { minPrice: true, variants: { where: { isActive: true }, select: { id: true } } } });
  if (!p) throw notFound("PRODUCT_NOT_FOUND", "Product");
  if (input.variantId && !p.variants.some((v) => v.id === input.variantId)) throw notFound("VARIANT_NOT_FOUND", "Variant");
  const item = await db.wishlistItem.upsert({
    where: { userId_productId: { userId, productId: input.productId } },
    create: { userId, productId: input.productId, variantId: input.variantId, priceAtAdd: p.minPrice },
    update: { variantId: input.variantId },
  });
  return { id: item.id };
}

export async function removeFromWishlist(userId: string, productId: string) {
  const res = await db.wishlistItem.deleteMany({ where: { userId, productId } });
  if (res.count === 0) throw notFound("WISHLIST_ITEM_NOT_FOUND", "Wishlist item");
}

export async function wishlistProductIds(userId: string) {
  const rows = await db.wishlistItem.findMany({ where: { userId }, select: { productId: true } });
  return rows.map((r) => r.productId);
}

/** Move a wishlist item into the cart (default variant unless one was saved/chosen). */
export async function moveWishlistToCart(owner: CartOwner & { userId: string }, productId: string, variantId?: string) {
  const item = await db.wishlistItem.findUnique({ where: { userId_productId: { userId: owner.userId, productId } } });
  if (!item) throw notFound("WISHLIST_ITEM_NOT_FOUND", "Wishlist item");
  let vid = variantId ?? item.variantId;
  if (!vid) {
    const v = await db.productVariant.findFirst({ where: { productId, isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], select: { id: true } });
    vid = v?.id ?? null;
  }
  if (!vid) throw notFound("VARIANT_NOT_FOUND", "Variant");
  await addItem(owner, { variantId: vid, quantity: 1 });
  await db.wishlistItem.delete({ where: { id: item.id } });
}
