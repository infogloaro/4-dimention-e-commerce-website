import { db, withTransaction } from "../db/client";
import { AppError, notFound } from "../core/errors";
import { hashToken, randomToken } from "../core/crypto";
import { normalizeCode } from "./coupons";
import { priceItems, type PriceResponse } from "./pricing-service";
import { getPublicOffers } from "./catalog/product";
import type { ShippingAddressLike } from "./shipping";

export interface CartOwner {
  userId?: string | null;
  /** raw guest token from the cookie */
  guestToken?: string | null;
}

const GUEST_TTL_DAYS = 30;
const MAX_LINES = 50;

async function findCart(owner: CartOwner) {
  if (owner.userId) return db.cart.findUnique({ where: { userId: owner.userId }, include: { items: { orderBy: { createdAt: "asc" } } } });
  if (owner.guestToken) return db.cart.findUnique({ where: { guestToken: hashToken(owner.guestToken) }, include: { items: { orderBy: { createdAt: "asc" } } } });
  return null;
}

/** Get-or-create. For guests returns the raw token to set as a cookie when a cart was created. */
async function ensureCart(owner: CartOwner) {
  const existing = await findCart(owner);
  if (existing) return { cart: existing, newGuestToken: null as string | null };
  if (owner.userId) {
    try {
      const cart = await db.cart.create({ data: { userId: owner.userId }, include: { items: true } });
      return { cart, newGuestToken: null };
    } catch {
      // concurrent create — the unique index on userId means the other one won
      return { cart: (await findCart(owner))!, newGuestToken: null };
    }
  }
  const raw = randomToken(24);
  const cart = await db.cart.create({ data: { guestToken: hashToken(raw), expiresAt: new Date(Date.now() + GUEST_TTL_DAYS * 86_400_000) }, include: { items: true } });
  return { cart, newGuestToken: raw };
}

export interface CartView {
  id: string | null;
  items: Array<Record<string, unknown>>;
  savedForLater: Array<Record<string, unknown>>;
  pricing: PriceResponse["pricing"];
  coupons: { applied: PriceResponse["pricing"]["appliedCoupons"]; rejected: PriceResponse["couponFailures"]; available: Awaited<ReturnType<typeof getPublicOffers>> };
  shipping: PriceResponse["shipping"];
  issues: PriceResponse["issues"];
  itemCount: number;
  pricesIncludeTax: boolean;
  updatedAt: Date | null;
}

export async function viewCart(owner: CartOwner, opts: { address?: ShippingAddressLike | null; shippingMethod?: string } = {}): Promise<CartView> {
  const cart = await findCart(owner);
  const lines = cart?.items ?? [];
  const active = lines.filter((l) => !l.savedForLater);
  const saved = lines.filter((l) => l.savedForLater);
  const priced = await priceItems({ items: active.map((l) => ({ variantId: l.variantId, quantity: l.quantity, priceAtAdd: l.priceAtAdd })), couponCodes: cart?.couponCodes ?? [], userId: owner.userId, address: opts.address, shippingMethod: opts.shippingMethod });
  const savedPriced = saved.length ? await priceItems({ items: saved.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), userId: owner.userId, skipShipping: true }) : null;

  const lineByVariant = new Map(priced.pricing.lines.map((l) => [l.key, l]));
  const itemIdByVariant = new Map(lines.map((l) => [l.variantId, l.id]));
  const items = priced.items.map((i) => {
    const l = lineByVariant.get(i.variantId);
    return {
      id: itemIdByVariant.get(i.variantId),
      ...i,
      lineSubtotal: l?.subtotal ?? i.unitPrice * i.quantity,
      discount: l?.discount ?? 0,
      tax: l?.tax ?? 0,
      lineTotal: l?.total ?? 0,
      savings: l?.savings ?? 0,
    };
  });
  const orphaned = active.filter((l) => !priced.items.some((i) => i.variantId === l.variantId));
  if (orphaned.length) void db.cartItem.deleteMany({ where: { id: { in: orphaned.map((o) => o.id) } } }).catch(() => undefined);

  return {
    id: cart?.id ?? null,
    items,
    savedForLater: (savedPriced?.items ?? []).map((i) => ({ id: itemIdByVariant.get(i.variantId), ...i })),
    pricing: priced.pricing,
    coupons: { applied: priced.pricing.appliedCoupons, rejected: priced.couponFailures, available: await getPublicOffers() },
    shipping: priced.shipping,
    issues: priced.issues,
    itemCount: active.reduce((s, l) => s + l.quantity, 0),
    pricesIncludeTax: priced.pricesIncludeTax,
    updatedAt: cart?.updatedAt ?? null,
  };
}

async function assertAddable(variantId: string, totalQty: number) {
  const priced = await priceItems({ items: [{ variantId, quantity: totalQty }], skipShipping: true });
  const item = priced.items[0];
  if (!item) throw notFound("VARIANT_NOT_FOUND", "Product variant");
  if (item.issues.some((i) => i.code === "UNAVAILABLE")) throw new AppError("ITEM_UNAVAILABLE", "This item is no longer available");
  if (item.issues.some((i) => i.code === "OUT_OF_STOCK")) throw new AppError("OUT_OF_STOCK", "This item is out of stock");
  const bad = item.issues.find((i) => i.code === "INSUFFICIENT_STOCK" || i.code === "MAX_QUANTITY");
  if (bad) throw new AppError(bad.code === "MAX_QUANTITY" ? "MAX_QUANTITY_EXCEEDED" : "INSUFFICIENT_STOCK", bad.message, { available: item.availability.available, maxPurchasable: item.availability.maxPurchasable });
  return item;
}

export async function addItem(owner: CartOwner, rawInput: { variantId: string; quantity?: number }) {
  const input = { variantId: rawInput.variantId, quantity: rawInput.quantity ?? 1 };
  const { cart, newGuestToken } = await ensureCart(owner);
  const existing = cart.items.find((i) => i.variantId === input.variantId);
  if (!existing && cart.items.length >= MAX_LINES) throw new AppError("MAX_QUANTITY_EXCEEDED", `A cart can hold at most ${MAX_LINES} different items`);
  const wanted = (existing && !existing.savedForLater ? existing.quantity : 0) + input.quantity;
  const item = await assertAddable(input.variantId, wanted);
  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
    create: { cartId: cart.id, variantId: input.variantId, quantity: input.quantity, priceAtAdd: item.unitPrice },
    update: { quantity: wanted, savedForLater: false, priceAtAdd: item.unitPrice },
  });
  await db.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
  return { newGuestToken };
}

export async function updateItem(owner: CartOwner, itemId: string, patch: { quantity?: number; savedForLater?: boolean }) {
  const cart = await findCart(owner);
  const item = cart?.items.find((i) => i.id === itemId);
  if (!cart || !item) throw notFound("CART_ITEM_NOT_FOUND", "Cart item");
  if (patch.quantity === 0) {
    await db.cartItem.delete({ where: { id: itemId } });
    return;
  }
  const quantity = patch.quantity ?? item.quantity;
  if (patch.quantity != null || patch.savedForLater === false) await assertAddable(item.variantId, quantity);
  await db.cartItem.update({ where: { id: itemId }, data: { quantity, ...(patch.savedForLater != null ? { savedForLater: patch.savedForLater } : {}) } });
  await db.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
}

export async function removeItem(owner: CartOwner, itemId: string) {
  const cart = await findCart(owner);
  if (!cart || !cart.items.some((i) => i.id === itemId)) throw notFound("CART_ITEM_NOT_FOUND", "Cart item");
  await db.cartItem.delete({ where: { id: itemId } });
}

export async function clearCart(owner: CartOwner) {
  const cart = await findCart(owner);
  if (!cart) return;
  await db.$transaction([db.cartItem.deleteMany({ where: { cartId: cart.id } }), db.cart.update({ where: { id: cart.id }, data: { couponCodes: [] } })]);
}

export async function applyCoupon(owner: CartOwner, rawCode: string) {
  const { cart, newGuestToken } = await ensureCart(owner);
  const code = normalizeCode(rawCode);
  const codes = [...new Set([...cart.couponCodes, code])];
  const active = cart.items.filter((i) => !i.savedForLater);
  if (active.length === 0) throw new AppError("CART_EMPTY", "Add items to your cart before applying a coupon");
  const priced = await priceItems({ items: active.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), couponCodes: codes, userId: owner.userId, skipShipping: true });
  const failure = priced.couponFailures.find((f) => f.code === code);
  if (failure) throw new AppError(failure.errorCode, failure.message, { code });
  await db.cart.update({ where: { id: cart.id }, data: { couponCodes: codes } });
  return { newGuestToken };
}

export async function removeCoupon(owner: CartOwner, rawCode: string) {
  const cart = await findCart(owner);
  if (!cart) return;
  const code = normalizeCode(rawCode);
  await db.cart.update({ where: { id: cart.id }, data: { couponCodes: cart.couponCodes.filter((c) => c !== code) } });
}

/** Fold an anonymous cart into the user's cart after login/registration. Idempotent: the guest cart is deleted. */
export async function mergeGuestCart(userId: string, rawGuestToken: string) {
  await withTransaction(async (tx) => {
    const guest = await tx.cart.findUnique({ where: { guestToken: hashToken(rawGuestToken) }, include: { items: true } });
    if (!guest) return;
    const mine = (await tx.cart.findUnique({ where: { userId } })) ?? (await tx.cart.create({ data: { userId } }));
    for (const gi of guest.items) {
      const cur = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: mine.id, variantId: gi.variantId } } });
      if (cur) await tx.cartItem.update({ where: { id: cur.id }, data: { quantity: Math.min(cur.quantity + gi.quantity, 100) } });
      else await tx.cartItem.create({ data: { cartId: mine.id, variantId: gi.variantId, quantity: gi.quantity, savedForLater: gi.savedForLater, priceAtAdd: gi.priceAtAdd } });
    }
    if (guest.couponCodes.length && mine.couponCodes.length === 0) await tx.cart.update({ where: { id: mine.id }, data: { couponCodes: guest.couponCodes } });
    await tx.cart.delete({ where: { id: guest.id } });
  });
}

/** Cart contents for checkout (active lines + coupon codes). */
export async function getCheckoutCart(userId: string) {
  const cart = await db.cart.findUnique({ where: { userId }, include: { items: true } });
  return { id: cart?.id ?? null, items: (cart?.items ?? []).filter((i) => !i.savedForLater), couponCodes: cart?.couponCodes ?? [] };
}
