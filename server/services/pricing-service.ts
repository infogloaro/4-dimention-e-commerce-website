import { db, type Db } from "../db/client";
import { env } from "../core/env";
import { calculatePricing, type PricingResult, type PricingLineInput } from "../domain/pricing";
import { categoryChain, categoryParentMap } from "./catalog/categories";
import { stockStatusOf } from "./catalog/dto";
import { resolveCoupons, type CouponCheckFailure } from "./coupons";
import { selectShipping, quoteShipping, type ShippingAddressLike, type ShippingOption } from "./shipping";

export interface RequestedItem {
  variantId: string;
  quantity: number;
  /** price the client/cart last showed — used only to flag changes, never to price. */
  priceAtAdd?: number;
}

export interface ItemIssue {
  code: "UNAVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_STOCK" | "MAX_QUANTITY" | "PRICE_CHANGED";
  message: string;
}

export interface PricedItem {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantName: string | null;
  sku: string;
  brand: string | null;
  category: string;
  image: string | null;
  options: Record<string, string>;
  quantity: number;
  unitPrice: number;
  compareAtPrice: number | null;
  taxRateBps: number;
  weightGrams: number;
  availability: { status: string; available: number; maxPurchasable: number };
  issues: ItemIssue[];
  priceChanged: { from: number; to: number } | null;
  /** false = cannot be purchased right now (excluded from totals). */
  purchasable: boolean;
}

export interface PriceRequest {
  items: RequestedItem[];
  couponCodes?: string[];
  userId?: string | null;
  address?: ShippingAddressLike | null;
  shippingMethod?: string;
  /** Skip the shipping lookup entirely (e.g. product page). */
  skipShipping?: boolean;
}

export interface PriceResponse {
  items: PricedItem[];
  pricing: PricingResult;
  couponFailures: CouponCheckFailure[];
  shipping: { selected: ShippingOption | null; options: ShippingOption[]; serviceable: boolean };
  issues: ItemIssue[];
  pricesIncludeTax: boolean;
}

/**
 * THE price calculation entry-point for cart, checkout and order creation: loads authoritative prices & stock
 * from the database, validates availability, resolves coupons and runs the pure pricing engine.
 */
export async function priceItems(req: PriceRequest, client: Db = db): Promise<PriceResponse> {
  const ids = [...new Set(req.items.map((i) => i.variantId))];
  const variants = ids.length
    ? await client.productVariant.findMany({
        where: { id: { in: ids } },
        include: {
          inventory: true,
          options: { select: { value: true, attribute: { select: { key: true } } } },
          product: {
            select: { id: true, slug: true, name: true, status: true, deletedAt: true, taxRateBps: true, categoryId: true, maxQuantityPerOrder: true, brand: { select: { name: true } }, category: { select: { name: true } }, media: { where: { variantId: null }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1, select: { url: true } } },
          },
          media: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true } },
        },
      })
    : [];
  const vmap = new Map(variants.map((v) => [v.id, v]));

  // merge duplicate lines (same variant)
  const requested = new Map<string, RequestedItem>();
  for (const it of req.items) {
    const prev = requested.get(it.variantId);
    requested.set(it.variantId, prev ? { ...prev, quantity: prev.quantity + it.quantity } : { ...it });
  }

  const parentMap = await categoryParentMap(client);
  const items: PricedItem[] = [];
  const lines: PricingLineInput[] = [];
  for (const it of requested.values()) {
    const v = vmap.get(it.variantId);
    if (!v) continue; // variant deleted: caller drops it
    const p = v.product;
    const issues: ItemIssue[] = [];
    const live = v.isActive && p.status === "ACTIVE" && !p.deletedAt;
    const stock = stockStatusOf(v.inventory);
    const backorder = v.inventory?.allowBackorder ?? false;
    const maxPurchasable = live ? Math.min(backorder ? p.maxQuantityPerOrder : stock.available, p.maxQuantityPerOrder) : 0;
    let quantity = it.quantity;

    if (!live) issues.push({ code: "UNAVAILABLE", message: "This item is no longer available" });
    else if (stock.status === "OUT_OF_STOCK") issues.push({ code: "OUT_OF_STOCK", message: "This item is out of stock" });
    else if (quantity > maxPurchasable) {
      issues.push({
        code: stock.available < Math.min(quantity, p.maxQuantityPerOrder) && !backorder ? "INSUFFICIENT_STOCK" : "MAX_QUANTITY",
        message: stock.available < quantity && !backorder ? `Only ${stock.available} available` : `Maximum ${p.maxQuantityPerOrder} per order`,
      });
    }
    const purchasable = live && stock.status !== "OUT_OF_STOCK" && quantity <= maxPurchasable;
    const priceChanged = it.priceAtAdd != null && it.priceAtAdd !== v.price ? { from: it.priceAtAdd, to: v.price } : null;
    if (priceChanged) issues.push({ code: "PRICE_CHANGED", message: `Price changed from ${it.priceAtAdd! / 100} to ${v.price / 100}` });
    if (!purchasable && live && maxPurchasable > 0) quantity = it.quantity; // keep requested qty visible; totals exclude it

    items.push({
      variantId: v.id,
      productId: p.id,
      slug: p.slug,
      name: p.name,
      variantName: v.name,
      sku: v.sku,
      brand: p.brand?.name ?? null,
      category: p.category.name,
      image: v.media[0]?.url ?? p.media[0]?.url ?? null,
      options: Object.fromEntries(v.options.map((o) => [o.attribute.key, o.value])),
      quantity,
      unitPrice: v.price,
      compareAtPrice: v.compareAtPrice,
      taxRateBps: v.taxRateBps ?? p.taxRateBps,
      weightGrams: v.weightGrams,
      availability: { status: stock.status, available: stock.available, maxPurchasable },
      issues,
      priceChanged,
      purchasable,
    });
    if (purchasable) {
      lines.push({ key: v.id, productId: p.id, categoryIds: await categoryChain(p.categoryId, parentMap), unitPrice: v.price, compareAtPrice: v.compareAtPrice, quantity, taxRateBps: v.taxRateBps ?? p.taxRateBps, weightGrams: v.weightGrams });
    }
  }

  const coupons = await resolveCoupons(req.couponCodes ?? [], { userId: req.userId }, client);
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const weight = lines.reduce((s, l) => s + (l.weightGrams ?? 0) * l.quantity, 0);

  let selected: ShippingOption | null = null;
  let options: ShippingOption[] = [];
  if (!req.skipShipping && lines.length) {
    options = await quoteShipping({ addr: req.address ?? null, subtotal, weightGrams: weight }, client);
    selected = req.shippingMethod
      ? (options.find((o) => o.code === req.shippingMethod) ?? null)
      : req.address
        ? await selectShipping({ addr: req.address, subtotal, weightGrams: weight }, client).catch(() => null)
        : (options.find((o) => o.code === "standard") ?? options[0] ?? null);
  }

  const pricing = calculatePricing({
    lines,
    coupons: coupons.rules,
    shipping: selected ? { fee: selected.fee, freeAboveSubtotal: selected.freeAboveSubtotal } : null,
    pricesIncludeTax: env.STORE_PRICES_INCLUDE_TAX,
  });

  const failures: CouponCheckFailure[] = [
    ...coupons.failures,
    ...pricing.rejectedCoupons.map((r) => ({ code: r.code, errorCode: r.reason, message: r.message })),
  ];

  return {
    items,
    pricing,
    couponFailures: failures,
    shipping: { selected, options, serviceable: req.skipShipping ? true : options.length > 0 },
    issues: items.flatMap((i) => i.issues),
    pricesIncludeTax: env.STORE_PRICES_INCLUDE_TAX,
  };
}
