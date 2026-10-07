import { db, Prisma } from "../db/client";
import { memo, invalidate } from "../core/cache";
import { AppError, notFound } from "../core/errors";
import { audit } from "./audit";
import type { AuthUser } from "../auth/session";
import type { ContentType, HomeSectionType } from "../db/generated/client";
import { getCategoryTree } from "./catalog/categories";
import { listCollections } from "./catalog/brands";
import { cardInclude, toCard } from "./catalog/dto";
import { personalized, recentlyViewed, trending, type ViewerKey } from "./recommendations";
import { publicSettings } from "./admin-ops";

const activeWindow = (now: Date): Prisma.ContentBlockWhereInput => ({ isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] });

export function blocksFor(placement: string) {
  return memo(`content:blocks:${placement}`, 30_000, () => db.contentBlock.findMany({ where: { placement, ...activeWindow(new Date()) }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] }));
}

async function productRail(source: string, limit: number) {
  const LIVE = { status: "ACTIVE" as const, deletedAt: null };
  const include = cardInclude;
  const where: Prisma.ProductWhereInput = { ...LIVE };
  let orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ soldCount: "desc" }];
  if (source === "trending") return trending(limit);
  if (source === "new") { where.isNewArrival = true; orderBy = [{ createdAt: "desc" }]; }
  else if (source === "bestsellers") { where.isBestseller = true; orderBy = [{ soldCount: "desc" }]; }
  else if (source === "featured") { where.isFeatured = true; orderBy = [{ ratingAvg: "desc" }]; }
  else if (source.startsWith("category:")) { where.category = { OR: [{ slug: source.slice(9) }, { path: { startsWith: `${source.slice(9)}/` } }] }; }
  else if (source.startsWith("collection:")) { where.collections = { some: { collection: { slug: source.slice(11), isActive: true } } }; }
  const rows = await db.product.findMany({ where, orderBy, take: limit, include });
  return rows.map(toCard);
}

/**
 * One call that assembles the whole home page from admin-managed sections. The frontend renders sections in order
 * and never hardcodes marketing content.
 */
export async function getHome(viewer: ViewerKey) {
  const now = new Date();
  const sections = await memo("content:home:sections", 30_000, () => db.homeSection.findMany({ where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }] }, orderBy: { sortOrder: "asc" } }));
  const [tree, collections, announcement, settings] = await Promise.all([getCategoryTree(), listCollections(), blocksFor("site.announcement"), publicSettings()]);

  const resolved = await Promise.all(
    sections.map(async (s) => {
      const cfg = (s.config ?? {}) as { placement?: string; source?: string; limit?: number; featuredOnly?: boolean; items?: unknown };
      const limit = Math.min(cfg.limit ?? 12, 24);
      let data: unknown = null;
      switch (s.type as HomeSectionType) {
        case "HERO":
        case "CONTENT_BLOCKS":
          data = { blocks: (await blocksFor(cfg.placement ?? "")).filter((b) => !b.endsAt || b.endsAt > now) };
          break;
        case "CATEGORY_RAIL":
          data = { categories: (cfg.featuredOnly === false ? tree : tree.flatMap((t) => [t, ...t.children]).filter((c) => c.isFeatured)).slice(0, limit).map(({ children: _c, ...c }) => c) };
          break;
        case "PRODUCT_RAIL":
          data = { products: await productRail(cfg.source ?? "trending", limit) };
          break;
        case "COLLECTION":
          data = { collections: collections.filter((c) => !cfg.featuredOnly || c.isFeatured).slice(0, limit) };
          break;
        case "RECENTLY_VIEWED":
          data = { products: await recentlyViewed(viewer, limit) };
          break;
        case "PERSONALIZED":
          data = await personalized(viewer, limit);
          break;
        default:
          data = { config: cfg };
      }
      return { id: s.id, key: s.key, type: s.type, title: s.title, subtitle: s.subtitle, data };
    }),
  );
  // viewers with no history would otherwise get an empty "Continue shopping" rail
  return { announcement: announcement[0] ?? null, sections: resolved.filter((s) => !(s.type === "RECENTLY_VIEWED" && !(s.data as { products: unknown[] }).products.length)), settings, generatedAt: now };
}

// ───────────────────────────── admin CRUD ─────────────────────────────

export interface BlockInput {
  type?: ContentType;
  placement?: string;
  title?: string;
  subtitle?: string | null;
  mediaUrl?: string | null;
  mobileMediaUrl?: string | null;
  mediaAlt?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  isActive?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  sortOrder?: number;
  metadata?: Prisma.InputJsonValue | null;
}

const bust = () => invalidate("content:");

export const listBlocks = (placement?: string) => db.contentBlock.findMany({ where: placement ? { placement } : {}, orderBy: [{ placement: "asc" }, { sortOrder: "asc" }] });

export async function createBlock(actor: AuthUser, input: BlockInput & { type: ContentType; placement: string; title: string }) {
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) throw new AppError("VALIDATION_ERROR", "endsAt must be after startsAt");
  const { metadata, ...rest } = input;
  const b = await db.contentBlock.create({ data: { ...rest, ...(metadata === undefined ? {} : { metadata: metadata ?? Prisma.JsonNull }) } });
  bust();
  await audit({ action: "content.created", resourceType: "content_block", resourceId: b.id, actor, metadata: { placement: b.placement } });
  return b;
}

export async function updateBlock(actor: AuthUser, id: string, input: BlockInput) {
  const { metadata, ...rest } = input;
  const res = await db.contentBlock.updateMany({ where: { id }, data: { ...rest, ...(metadata === undefined ? {} : { metadata: metadata ?? Prisma.JsonNull }) } });
  if (res.count === 0) throw notFound("CONTENT_NOT_FOUND", "Content block");
  bust();
  await audit({ action: "content.updated", resourceType: "content_block", resourceId: id, actor, metadata: { fields: Object.keys(input) } });
  return db.contentBlock.findUniqueOrThrow({ where: { id } });
}

export async function deleteBlock(actor: AuthUser, id: string) {
  const res = await db.contentBlock.deleteMany({ where: { id } });
  if (res.count === 0) throw notFound("CONTENT_NOT_FOUND", "Content block");
  bust();
  await audit({ action: "content.deleted", resourceType: "content_block", resourceId: id, actor });
}

export const listSections = () => db.homeSection.findMany({ orderBy: { sortOrder: "asc" } });

export interface SectionInput {
  key?: string;
  type?: HomeSectionType;
  title?: string | null;
  subtitle?: string | null;
  config?: Prisma.InputJsonValue;
  isActive?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  sortOrder?: number;
}

export async function upsertSection(actor: AuthUser, input: SectionInput & { key: string; type: HomeSectionType }) {
  const s = await db.homeSection.upsert({ where: { key: input.key }, create: input, update: input });
  bust();
  await audit({ action: "home_section.saved", resourceType: "home_section", resourceId: s.id, actor, metadata: { key: s.key } });
  return s;
}

export async function deleteSection(actor: AuthUser, id: string) {
  const res = await db.homeSection.deleteMany({ where: { id } });
  if (res.count === 0) throw notFound("CONTENT_NOT_FOUND", "Home section");
  bust();
  await audit({ action: "home_section.deleted", resourceType: "home_section", resourceId: id, actor });
}

export async function reorderSections(actor: AuthUser, items: Array<{ id: string; sortOrder: number }>) {
  await db.$transaction(items.map((i) => db.homeSection.update({ where: { id: i.id }, data: { sortOrder: i.sortOrder } })));
  bust();
  await audit({ action: "home_section.reordered", resourceType: "home_section", actor, metadata: { count: items.length } });
}
