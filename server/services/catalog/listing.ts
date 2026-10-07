import { db, Prisma } from "../../db/client";
import { buildPageMeta, MAX_OFFSET, type PaginationInput } from "../../core/pagination";
import { categoryScope } from "./categories";
import { cardInclude, toCard } from "./dto";
import { logSearch, normalizeQuery, searchProductIds } from "./search";
import { memo } from "../../core/cache";

export const SORTS = ["relevance", "newest", "price_asc", "price_desc", "rating", "popularity", "bestselling", "discount"] as const;
export type SortKey = (typeof SORTS)[number];

export interface ListingQuery extends PaginationInput {
  q?: string;
  category?: string;
  brand?: string[];
  collection?: string;
  tag?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  minDiscount?: number;
  productType?: string[];
  featured?: boolean;
  bestseller?: boolean;
  newArrival?: boolean;
  attrs: Record<string, string[]>;
  sort: SortKey;
  facets: boolean;
}

const LIVE: Prisma.ProductWhereInput = { status: "ACTIVE", deletedAt: null };
const FACET_ID_CAP = 3000;

type Exclude = "brand" | "price" | "none";

async function buildWhere(query: ListingQuery, searchIds: string[] | null, exclude: Exclude = "none"): Promise<Prisma.ProductWhereInput> {
  const and: Prisma.ProductWhereInput[] = [LIVE];
  if (searchIds) and.push({ id: { in: searchIds } });
  if (query.category) {
    const scope = await categoryScope(query.category);
    and.push({ categoryId: { in: scope.ids } });
  }
  if (query.brand?.length && exclude !== "brand") and.push({ brand: { slug: { in: query.brand }, isActive: true } });
  if (query.collection) and.push({ collections: { some: { collection: { slug: query.collection, isActive: true } } } });
  if (query.tag?.length) and.push({ tags: { some: { tag: { slug: { in: query.tag } } } } });
  if (exclude !== "price") {
    if (query.minPrice != null) and.push({ maxPrice: { gte: query.minPrice } });
    if (query.maxPrice != null) and.push({ minPrice: { lte: query.maxPrice } });
  }
  if (query.minRating != null) and.push({ ratingAvg: { gte: query.minRating } });
  if (query.inStock) and.push({ inStock: true });
  if (query.minDiscount != null) and.push({ maxDiscountPct: { gte: query.minDiscount } });
  if (query.productType?.length) and.push({ productType: { in: query.productType } });
  if (query.featured) and.push({ isFeatured: true });
  if (query.bestseller) and.push({ isBestseller: true });
  if (query.newArrival) and.push({ isNewArrival: true });
  for (const [key, values] of Object.entries(query.attrs)) {
    if (!values.length) continue;
    and.push({
      OR: [
        { variants: { some: { isActive: true, options: { some: { attribute: { key }, value: { in: values } } } } } },
        { attributes: { some: { attribute: { key }, value: { in: values } } } },
      ],
    });
  }
  return { AND: and };
}

function orderBy(sort: SortKey): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" }, { id: "asc" }];
    case "price_asc":
      return [{ minPrice: "asc" }, { id: "asc" }];
    case "price_desc":
      return [{ maxPrice: "desc" }, { id: "asc" }];
    case "rating":
      return [{ ratingAvg: "desc" }, { ratingCount: "desc" }, { id: "asc" }];
    case "bestselling":
      return [{ soldCount: "desc" }, { id: "asc" }];
    case "discount":
      return [{ maxDiscountPct: "desc" }, { id: "asc" }];
    case "popularity":
    case "relevance":
    default:
      return [{ viewCount: "desc" }, { soldCount: "desc" }, { id: "asc" }];
  }
}

export async function listProducts(query: ListingQuery, opts: { userId?: string | null; logSearches?: boolean } = {}) {
  const page: PaginationInput = { page: query.page, pageSize: query.pageSize };
  const hasQuery = !!query.q && normalizeQuery(query.q).tokens.length > 0;

  let hits: Array<{ id: string; score: number }> | null = null;
  if (hasQuery) hits = await searchProductIds(query.q!);
  const searchIds = hits ? hits.map((h) => h.id) : null;

  const where = await buildWhere(query, searchIds);
  const skip = Math.min((query.page - 1) * query.pageSize, MAX_OFFSET);

  let rows;
  let total: number;
  if (hasQuery && query.sort === "relevance") {
    // rank order comes from the search score; filters narrow the candidate set
    const candidates = await db.product.findMany({ where, select: { id: true } });
    const rank = new Map(hits!.map((h, i) => [h.id, i]));
    const ordered = candidates.map((c) => c.id).sort((a, b) => rank.get(a)! - rank.get(b)!);
    total = ordered.length;
    const pageIds = ordered.slice(skip, skip + query.pageSize);
    const found = pageIds.length ? await db.product.findMany({ where: { id: { in: pageIds } }, include: cardInclude }) : [];
    const pos = new Map(pageIds.map((id, i) => [id, i]));
    rows = found.sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
  } else {
    [rows, total] = await Promise.all([
      db.product.findMany({ where, orderBy: orderBy(query.sort), skip, take: query.pageSize, include: cardInclude }),
      db.product.count({ where }),
    ]);
  }

  if (hasQuery && opts.logSearches !== false && query.page === 1) logSearch(query.q!, total, opts.userId);

  const result = {
    items: rows.map(toCard),
    meta: { ...buildPageMeta(page, total), sort: query.sort, query: hasQuery ? query.q : null },
    facets: query.facets ? await buildFacets(query, searchIds, where, total) : undefined,
    emptyState: undefined as undefined | Awaited<ReturnType<typeof emptyStateSuggestions>>,
  };
  if (total === 0) result.emptyState = await emptyStateSuggestions(query.q);
  return result;
}

async function buildFacets(query: ListingQuery, searchIds: string[] | null, where: Prisma.ProductWhereInput, total: number) {
  if (total === 0) return { brands: [], categories: [], priceRange: null, ratings: [], availability: { inStock: 0, outOfStock: 0 }, attributes: [], discounts: [] };

  const [brandWhere, priceWhere] = await Promise.all([buildWhere(query, searchIds, "brand"), buildWhere(query, searchIds, "price")]);
  const [brandGroups, catGroups, priceAgg, ratingCounts, stockGroups, discountCounts, idRows] = await Promise.all([
    db.product.groupBy({ by: ["brandId"], where: brandWhere, _count: { _all: true } }),
    db.product.groupBy({ by: ["categoryId"], where, _count: { _all: true } }),
    db.product.aggregate({ where: priceWhere, _min: { minPrice: true }, _max: { maxPrice: true } }),
    Promise.all([4, 3, 2].map(async (r) => ({ min: r, count: await db.product.count({ where: { AND: [where, { ratingAvg: { gte: r } }] } }) }))),
    db.product.groupBy({ by: ["inStock"], where: { AND: [where] }, _count: { _all: true } }),
    Promise.all([10, 25, 50].map(async (d) => ({ min: d, count: await db.product.count({ where: { AND: [where, { maxDiscountPct: { gte: d } }] } }) }))),
    db.product.findMany({ where, select: { id: true }, take: FACET_ID_CAP }),
  ]);

  const brandIds = brandGroups.map((g) => g.brandId).filter((x): x is string => !!x);
  const catIds = catGroups.map((g) => g.categoryId);
  const [brands, cats] = await Promise.all([
    db.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true, slug: true } }),
    db.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true, slug: true } }),
  ]);
  const brandMap = new Map(brands.map((b) => [b.id, b]));
  const catMap = new Map(cats.map((c) => [c.id, c]));

  const ids = idRows.map((r) => r.id);
  const attrRows = ids.length
    ? await db.$queryRaw<Array<{ key: string; name: string; value: string; swatch: string | null; n: number }>>`
        SELECT a.key, a.name, x.value, max(x.swatch) AS swatch, count(DISTINCT x."productId")::int AS n
        FROM (
          SELECT v."productId", o."attributeId", o.value, o.swatch FROM "VariantOptionValue" o
            JOIN "ProductVariant" v ON v.id = o."variantId" AND v."isActive" WHERE v."productId" = ANY(${ids}::text[])
          UNION ALL
          SELECT pav."productId", pav."attributeId", pav.value, NULL FROM "ProductAttributeValue" pav WHERE pav."productId" = ANY(${ids}::text[])
        ) x JOIN "Attribute" a ON a.id = x."attributeId" AND a."isFilterable"
        GROUP BY a.key, a.name, x.value ORDER BY a.name, n DESC, x.value`
    : [];
  const attributes = new Map<string, { key: string; name: string; values: Array<{ value: string; swatch: string | null; count: number; selected: boolean }> }>();
  for (const r of attrRows) {
    const entry = attributes.get(r.key) ?? attributes.set(r.key, { key: r.key, name: r.name, values: [] }).get(r.key)!;
    entry.values.push({ value: r.value, swatch: r.swatch, count: r.n, selected: query.attrs[r.key]?.includes(r.value) ?? false });
  }

  return {
    brands: brandGroups
      .map((g) => ({ ...(g.brandId ? brandMap.get(g.brandId) : undefined), count: g._count._all }))
      .filter((b): b is { id: string; name: string; slug: string; count: number } => !!b.id)
      .map((b) => ({ ...b, selected: query.brand?.includes(b.slug) ?? false }))
      .sort((a, b) => b.count - a.count),
    categories: catGroups
      .map((g) => ({ ...catMap.get(g.categoryId)!, count: g._count._all }))
      .filter((c) => c.id)
      .sort((a, b) => b.count - a.count),
    priceRange: priceAgg._min.minPrice == null ? null : { min: priceAgg._min.minPrice, max: priceAgg._max.maxPrice ?? priceAgg._min.minPrice },
    ratings: ratingCounts,
    discounts: discountCounts,
    availability: {
      inStock: stockGroups.find((g) => g.inStock)?._count._all ?? 0,
      outOfStock: stockGroups.find((g) => !g.inStock)?._count._all ?? 0,
    },
    attributes: [...attributes.values()],
  };
}

/** What to show when nothing matched: related categories and popular products so the page is never a dead end. */
export async function emptyStateSuggestions(q?: string) {
  const popular = await memo("listing:popular", 5 * 60_000, () =>
    db.product.findMany({ where: LIVE, orderBy: [{ soldCount: "desc" }, { ratingAvg: "desc" }], take: 8, include: cardInclude }),
  );
  const tokens = q ? normalizeQuery(q).tokens : [];
  const categories = tokens.length
    ? await db.category.findMany({ where: { isActive: true, OR: tokens.map((t) => ({ name: { contains: t.slice(0, Math.max(3, t.length - 2)), mode: "insensitive" as const } })) }, take: 5, select: { id: true, name: true, slug: true } })
    : await db.category.findMany({ where: { isActive: true, parentId: null }, take: 6, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, slug: true } });
  return { message: q ? `No results for “${q}”` : "No products match your filters", categories, popularProducts: popular.map(toCard) };
}
