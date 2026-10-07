import { db } from "../../db/client";
import { memo } from "../../core/cache";
import { notFound } from "../../core/errors";

export function listBrands(opts: { featured?: boolean } = {}) {
  return memo(`brands:list:${opts.featured ? "f" : "a"}`, 60_000, async () => {
    const [brands, counts] = await Promise.all([
      db.brand.findMany({ where: { isActive: true, ...(opts.featured ? { isFeatured: true } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, logoUrl: true, bannerUrl: true, description: true, isFeatured: true } }),
      db.product.groupBy({ by: ["brandId"], where: { status: "ACTIVE", deletedAt: null, brandId: { not: null } }, _count: { _all: true } }),
    ]);
    const n = new Map(counts.map((c) => [c.brandId, c._count._all]));
    return brands.map((b) => ({ ...b, productCount: n.get(b.id) ?? 0 }));
  });
}

export async function getBrand(slug: string) {
  const b = await db.brand.findFirst({ where: { slug, isActive: true } });
  if (!b) throw notFound("BRAND_NOT_FOUND", "Brand");
  return { ...b, seo: { title: b.seoTitle ?? b.name, description: b.seoDescription ?? b.description, keywords: b.seoKeywords, ogImage: b.ogImageUrl ?? b.bannerUrl ?? b.logoUrl, canonicalUrl: b.canonicalUrl } };
}

export function listCollections() {
  return memo("collections:list", 60_000, async () => {
    const now = new Date();
    const rows = await db.collection.findMany({
      where: { isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, description: true, imageUrl: true, bannerUrl: true, isFeatured: true, endsAt: true, _count: { select: { products: true } } },
    });
    return rows.map(({ _count, ...c }) => ({ ...c, productCount: _count.products }));
  });
}

export async function getCollection(slug: string) {
  const now = new Date();
  const c = await db.collection.findFirst({ where: { slug, isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] } });
  if (!c) throw notFound("COLLECTION_NOT_FOUND", "Collection");
  return { ...c, seo: { title: c.seoTitle ?? c.name, description: c.seoDescription ?? c.description, ogImage: c.ogImageUrl ?? c.bannerUrl ?? c.imageUrl } };
}
