import { db } from "../../db/client";
import { env } from "../../core/env";
import { memo } from "../../core/cache";
import { notFound } from "../../core/errors";
import { describePrice } from "../../domain/pricing";
import { breadcrumbsFor } from "./categories";
import { stockStatusOf } from "./dto";

const detailInclude = {
  brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
  category: { select: { id: true, name: true, slug: true } },
  media: { orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }] },
  tags: { select: { tag: { select: { name: true, slug: true } } } },
  attributes: { orderBy: { sortOrder: "asc" as const }, select: { value: true, attribute: { select: { key: true, name: true, unit: true, group: true, sortOrder: true } } } },
  variants: {
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" as const }, { sortOrder: "asc" as const }],
    include: {
      inventory: true,
      options: { select: { value: true, swatch: true, attribute: { select: { key: true, name: true, sortOrder: true } } } },
    },
  },
};

export interface OfferDto {
  code: string;
  description: string | null;
  type: string;
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  endsAt: Date | null;
}

/** Publicly advertised coupons (shown on product & cart pages). */
export function getPublicOffers(): Promise<OfferDto[]> {
  return memo("offers:public", 60_000, async () => {
    const now = new Date();
    const rows = await db.coupon.findMany({
      where: { isActive: true, isPublic: true, restrictedToUserId: null, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    return rows
      .filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit)
      .map((c) => ({ code: c.code, description: c.description, type: c.type, value: c.value, minSubtotal: c.minSubtotal, maxDiscount: c.maxDiscount, endsAt: c.endsAt }));
  });
}

export async function getProductDetail(slug: string, opts: { includeDrafts?: boolean } = {}) {
  const p = await db.product.findFirst({
    where: { slug, deletedAt: null, ...(opts.includeDrafts ? { status: { in: ["ACTIVE", "DRAFT"] } } : { status: "ACTIVE" }) },
    include: detailInclude,
  });
  if (!p) throw notFound("PRODUCT_NOT_FOUND", "Product");

  const variants = p.variants.map((v) => {
    const stock = stockStatusOf(v.inventory);
    return {
      id: v.id,
      sku: v.sku,
      name: v.name,
      isDefault: v.isDefault,
      price: describePrice(v.price, v.compareAtPrice),
      weightGrams: v.weightGrams,
      options: Object.fromEntries(v.options.map((o) => [o.attribute.key, o.value])),
      availability: {
        status: stock.status,
        inStock: stock.status !== "OUT_OF_STOCK",
        available: stock.available,
        maxPurchasable: Math.min(stock.available || 0, p.maxQuantityPerOrder),
        lowStock: stock.status === "LOW_STOCK",
        message: stock.status === "OUT_OF_STOCK" ? "Out of stock" : stock.status === "LOW_STOCK" ? `Only ${stock.available} left` : "In stock",
      },
      mediaIds: p.media.filter((m) => m.variantId === v.id).map((m) => m.id),
    };
  });

  // option axes (size, colour ...) with per-value availability so the UI can disable — never silently drop — values
  const axes = new Map<string, { key: string; name: string; sortOrder: number; values: Map<string, { value: string; swatch: string | null; variantIds: string[]; available: boolean }> }>();
  for (const v of p.variants) {
    const avail = stockStatusOf(v.inventory).status !== "OUT_OF_STOCK";
    for (const o of v.options) {
      const axis = axes.get(o.attribute.key) ?? axes.set(o.attribute.key, { key: o.attribute.key, name: o.attribute.name, sortOrder: o.attribute.sortOrder, values: new Map() }).get(o.attribute.key)!;
      const val = axis.values.get(o.value) ?? axis.values.set(o.value, { value: o.value, swatch: o.swatch, variantIds: [], available: false }).get(o.value)!;
      val.variantIds.push(v.id);
      val.available ||= avail;
    }
  }
  const options = [...axes.values()].sort((a, b) => a.sortOrder - b.sortOrder).map((a) => ({ key: a.key, name: a.name, values: [...a.values.values()] }));

  const specGroups = new Map<string, Array<{ name: string; value: string; unit: string | null }>>();
  for (const a of p.attributes) {
    const g = a.attribute.group ?? "General";
    (specGroups.get(g) ?? specGroups.set(g, []).get(g)!).push({ name: a.attribute.name, value: a.value, unit: a.attribute.unit });
  }

  const sellable = variants.filter((v) => v.availability.inStock);
  const cheapest = [...(sellable.length ? sellable : variants)].sort((a, b) => a.price.price - b.price.price)[0];
  const breadcrumbs = await breadcrumbsFor(p.categoryId);
  const primary = p.media.find((m) => m.type === "IMAGE");
  const rating = { average: Number(p.ratingAvg), count: p.ratingCount, breakdown: p.ratingBreakdown as Record<string, number> };
  const canonical = p.canonicalUrl ?? `${env.APP_URL}/product/${p.slug}`;

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    status: p.status,
    shortDescription: p.shortDescription,
    description: p.description,
    highlights: p.highlights,
    brand: p.brand,
    category: p.category,
    breadcrumbs,
    tags: p.tags.map((t) => t.tag),
    badges: [
      ...(p.maxDiscountPct >= 10 ? [{ key: "sale", label: `${p.maxDiscountPct}% OFF` }] : []),
      ...(p.isNewArrival ? [{ key: "new", label: "New" }] : []),
      ...(p.isBestseller ? [{ key: "bestseller", label: "Bestseller" }] : []),
      ...p.badges.map((b) => ({ key: b.toLowerCase().replace(/\s+/g, "-"), label: b })),
    ],
    media: p.media.map((m) => ({ id: m.id, type: m.type, url: m.url, thumbnailUrl: m.thumbnailUrl, alt: m.alt ?? p.name, width: m.width, height: m.height, durationSec: m.durationSec, isPrimary: m.isPrimary, variantId: m.variantId })),
    options,
    variants,
    defaultVariantId: variants.find((v) => v.isDefault)?.id ?? variants[0]?.id ?? null,
    price: cheapest ? { ...cheapest.price, from: p.minPrice !== p.maxPrice, min: p.minPrice, max: p.maxPrice } : null,
    inStock: sellable.length > 0,
    maxQuantityPerOrder: p.maxQuantityPerOrder,
    taxRatePercent: p.taxRateBps / 100,
    pricesIncludeTax: env.STORE_PRICES_INCLUDE_TAX,
    specifications: [...specGroups].map(([group, items]) => ({ group, items })),
    rating,
    offers: await getPublicOffers(),
    seo: {
      title: p.seoTitle ?? `${p.name}${p.brand ? ` | ${p.brand.name}` : ""}`,
      description: p.seoDescription ?? p.shortDescription ?? undefined,
      keywords: p.seoKeywords,
      canonicalUrl: canonical,
      ogImage: p.ogImageUrl ?? primary?.url ?? null,
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      description: p.shortDescription ?? undefined,
      sku: variants[0]?.sku,
      image: p.media.filter((m) => m.type === "IMAGE").map((m) => m.url),
      brand: p.brand ? { "@type": "Brand", name: p.brand.name } : undefined,
      aggregateRating: p.ratingCount > 0 ? { "@type": "AggregateRating", ratingValue: Number(p.ratingAvg), reviewCount: p.ratingCount } : undefined,
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: env.STORE_CURRENCY,
        lowPrice: p.minPrice / 100,
        highPrice: p.maxPrice / 100,
        offerCount: variants.length,
        availability: sellable.length ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        url: canonical,
      },
    },
    publishedAt: p.publishedAt,
    updatedAt: p.updatedAt,
  };
}

/** Side-by-side compare payload (spec: /compare). Max 4 products. */
export async function compareProducts(slugsOrIds: string[]) {
  const rows = await db.product.findMany({
    where: { status: "ACTIVE", deletedAt: null, OR: [{ id: { in: slugsOrIds.filter((s) => /^[0-9a-f-]{36}$/i.test(s)) } }, { slug: { in: slugsOrIds } }] },
    take: 4,
    include: { brand: { select: { name: true } }, category: { select: { name: true, slug: true } }, media: { where: { variantId: null }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 }, attributes: { select: { value: true, attribute: { select: { key: true, name: true, unit: true, group: true } } } } },
  });
  const rowKeys = new Map<string, { key: string; name: string; unit: string | null }>();
  for (const r of rows) for (const a of r.attributes) if (!rowKeys.has(a.attribute.key)) rowKeys.set(a.attribute.key, { key: a.attribute.key, name: a.attribute.name, unit: a.attribute.unit });
  return {
    products: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      brand: r.brand?.name ?? null,
      category: r.category,
      image: r.media[0]?.url ?? null,
      price: describePrice(r.minPrice, r.maxPrice > r.minPrice ? null : null),
      priceMax: r.maxPrice,
      rating: { average: Number(r.ratingAvg), count: r.ratingCount },
      inStock: r.inStock,
      specs: Object.fromEntries(r.attributes.map((a) => [a.attribute.key, a.value])),
    })),
    rows: [...rowKeys.values()],
  };
}
