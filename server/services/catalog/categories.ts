import { db, type Db } from "../../db/client";
import { AppError, notFound } from "../../core/errors";
import { memo } from "../../core/cache";

export interface CategoryNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  depth: number;
  description: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  iconName: string | null;
  isFeatured: boolean;
  sortOrder: number;
  productCount: number;
  children: CategoryNode[];
}

const TREE_TTL = 60_000;

/** Active categories as a nested tree, each node carrying the number of live products beneath it. One cached query set. */
export function getCategoryTree(): Promise<CategoryNode[]> {
  return memo("categories:tree", TREE_TTL, async () => {
    const [rows, counts] = await Promise.all([
      db.category.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, parentId: true, name: true, slug: true, path: true, depth: true, description: true, imageUrl: true, bannerUrl: true, iconName: true, isFeatured: true, sortOrder: true },
      }),
      db.product.groupBy({ by: ["categoryId"], where: { status: "ACTIVE", deletedAt: null }, _count: { _all: true } }),
    ]);
    const direct = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    const nodes = new Map<string, CategoryNode>(rows.map((r) => [r.id, { ...r, productCount: direct.get(r.id) ?? 0, children: [] }]));
    const roots: CategoryNode[] = [];
    for (const n of nodes.values()) {
      const parent = n.parentId ? nodes.get(n.parentId) : undefined;
      if (parent) parent.children.push(n);
      else if (!n.parentId) roots.push(n);
    }
    // roll product counts up so a parent shows everything beneath it
    const roll = (n: CategoryNode): number => (n.productCount += n.children.reduce((s, c) => s + roll(c), 0));
    roots.forEach(roll);
    return roots;
  });
}

function flatten(nodes: CategoryNode[], out: CategoryNode[] = []): CategoryNode[] {
  for (const n of nodes) {
    out.push(n);
    flatten(n.children, out);
  }
  return out;
}

export async function getCategoryDetail(slug: string) {
  const tree = await getCategoryTree();
  const flat = flatten(tree);
  const node = flat.find((n) => n.slug === slug);
  if (!node) throw notFound("CATEGORY_NOT_FOUND", "Category");
  const byId = new Map(flat.map((n) => [n.id, n]));
  const breadcrumbs: Array<{ id: string; name: string; slug: string }> = [];
  for (let cur: CategoryNode | undefined = node; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    breadcrumbs.unshift({ id: cur.id, name: cur.name, slug: cur.slug });
  }
  const full = await db.category.findUnique({
    where: { id: node.id },
    select: {
      seoTitle: true,
      seoDescription: true,
      seoKeywords: true,
      ogImageUrl: true,
      canonicalUrl: true,
      attributes: { orderBy: { sortOrder: "asc" }, select: { attribute: { select: { key: true, name: true, unit: true, isFilterable: true, kind: true } } } },
    },
  });
  return {
    ...node,
    children: node.children.map(({ children: _c, ...rest }) => rest),
    breadcrumbs,
    seo: { title: full?.seoTitle ?? node.name, description: full?.seoDescription ?? node.description, keywords: full?.seoKeywords ?? [], ogImage: full?.ogImageUrl ?? node.bannerUrl ?? node.imageUrl, canonicalUrl: full?.canonicalUrl ?? null },
    attributes: (full?.attributes ?? []).map((a) => a.attribute),
  };
}

/** id → parentId for ALL categories (incl. inactive). Used for coupon scoping and breadcrumbs. */
export function categoryParentMap(client?: Db): Promise<Map<string, string | null>> {
  const load = async (c: Db) => new Map((await c.category.findMany({ select: { id: true, parentId: true } })).map((r) => [r.id, r.parentId] as const));
  // Inside a transaction we must use ITS connection (a second pooled connection can deadlock under load) and skip the shared cache.
  return client && client !== (db as Db) ? load(client) : memo("categories:parents", TREE_TTL, () => load(db));
}

/** [categoryId, parent, grandparent, ...] */
export async function categoryChain(categoryId: string, parentsMap?: Map<string, string | null>): Promise<string[]> {
  const parents = parentsMap ?? (await categoryParentMap());
  const chain: string[] = [];
  for (let cur: string | null | undefined = categoryId; cur && chain.length < 10; cur = parents.get(cur)) chain.push(cur);
  return chain;
}

/** Resolves a slug to the id set {self + descendants}, used to include subcategory products in a listing. */
export async function categoryScope(slug: string): Promise<{ id: string; ids: string[] }> {
  const row = await db.category.findUnique({ where: { slug }, select: { id: true, path: true, isActive: true } });
  if (!row || !row.isActive) throw new AppError("CATEGORY_NOT_FOUND", "Category not found");
  const descendants = await db.category.findMany({ where: { OR: [{ id: row.id }, { path: { startsWith: `${row.path}/` } }] }, select: { id: true } });
  return { id: row.id, ids: descendants.map((d) => d.id) };
}

/** Root → leaf breadcrumb for a category id (uses the cached tree, so no query per call). */
export async function breadcrumbsFor(categoryId: string): Promise<Array<{ id: string; name: string; slug: string }>> {
  const flat = flatten(await getCategoryTree());
  const byId = new Map(flat.map((n) => [n.id, n]));
  const crumbs: Array<{ id: string; name: string; slug: string }> = [];
  for (let cur = byId.get(categoryId); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    crumbs.unshift({ id: cur.id, name: cur.name, slug: cur.slug });
  }
  return crumbs;
}
