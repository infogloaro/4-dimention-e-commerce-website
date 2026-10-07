import type { Prisma } from "../../db/generated/client";
import { describePrice } from "../../domain/pricing";

/** Shared Prisma selection for anything that renders a product card (lists, rails, search, wishlist...). */
export const cardInclude = {
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  media: { where: { variantId: null }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 2, select: { id: true, url: true, thumbnailUrl: true, alt: true, width: true, height: true, type: true } },
  variants: {
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      sku: true,
      price: true,
      compareAtPrice: true,
      isDefault: true,
      inventory: { select: { quantity: true, reserved: true, lowStockThreshold: true, allowBackorder: true } },
      options: { select: { value: true, swatch: true, attribute: { select: { key: true } } } },
    },
  },
} satisfies Prisma.ProductInclude;

export type CardRow = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export function stockStatusOf(inv: { quantity: number; reserved: number; lowStockThreshold: number; allowBackorder: boolean } | null | undefined): { status: StockStatus; available: number } {
  if (!inv) return { status: "OUT_OF_STOCK", available: 0 };
  const available = Math.max(0, inv.quantity - inv.reserved);
  if (inv.allowBackorder) return { status: "IN_STOCK", available };
  if (available <= 0) return { status: "OUT_OF_STOCK", available: 0 };
  return { status: available <= inv.lowStockThreshold ? "LOW_STOCK" : "IN_STOCK", available };
}

export interface Badge {
  key: string;
  label: string;
}

function badgesFor(p: CardRow, status: StockStatus): Badge[] {
  const out: Badge[] = [];
  if (p.maxDiscountPct >= 10) out.push({ key: "sale", label: `${p.maxDiscountPct}% OFF` });
  if (p.isNewArrival) out.push({ key: "new", label: "New" });
  if (p.isBestseller) out.push({ key: "bestseller", label: "Bestseller" });
  if (status === "LOW_STOCK") out.push({ key: "low-stock", label: "Few left" });
  for (const b of p.badges) out.push({ key: b.toLowerCase().replace(/\s+/g, "-"), label: b });
  return out.slice(0, 3); // product cards avoid badge overload
}

export function toCard(p: CardRow) {
  const variants = p.variants;
  const cheapest = [...variants].sort((a, b) => a.price - b.price)[0];
  const agg = variants.reduce(
    (acc, v) => {
      const s = stockStatusOf(v.inventory);
      if (s.status !== "OUT_OF_STOCK") acc.sellable++;
      if (s.status === "LOW_STOCK") acc.low++;
      return acc;
    },
    { sellable: 0, low: 0 },
  );
  const stockStatus: StockStatus = agg.sellable === 0 ? "OUT_OF_STOCK" : agg.low === agg.sellable ? "LOW_STOCK" : "IN_STOCK";
  const swatches = new Map<string, string | null>();
  for (const v of variants) for (const o of v.options) if (o.attribute.key === "color" && !swatches.has(o.value)) swatches.set(o.value, o.swatch);
  const price = cheapest ? describePrice(cheapest.price, cheapest.compareAtPrice) : describePrice(p.minPrice, null);

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    brand: p.brand,
    category: p.category,
    image: p.media[0] ? { url: p.media[0].url, thumbnailUrl: p.media[0].thumbnailUrl, alt: p.media[0].alt ?? p.name, width: p.media[0].width, height: p.media[0].height } : null,
    hoverImage: p.media[1] ? { url: p.media[1].url, alt: p.media[1].alt ?? p.name } : null,
    price: { ...price, from: p.minPrice !== p.maxPrice, min: p.minPrice, max: p.maxPrice },
    rating: { average: Number(p.ratingAvg), count: p.ratingCount },
    badges: badgesFor(p, stockStatus),
    inStock: stockStatus !== "OUT_OF_STOCK",
    stockStatus,
    hasVariants: variants.length > 1,
    defaultVariantId: variants.find((v) => v.isDefault)?.id ?? variants[0]?.id ?? null,
    swatches: [...swatches].slice(0, 6).map(([value, swatch]) => ({ value, swatch })),
    isFeatured: p.isFeatured,
    createdAt: p.createdAt,
  };
}

export type ProductCard = ReturnType<typeof toCard>;

/** Light payload for autocomplete / quick previews. */
export function toMini(p: CardRow) {
  const c = toCard(p);
  return { id: c.id, slug: c.slug, name: c.name, brand: c.brand?.name ?? null, image: c.image?.thumbnailUrl ?? c.image?.url ?? null, price: c.price.min, compareAtPrice: c.price.compareAtPrice, inStock: c.inStock };
}
