import { z } from "zod";
import { arrayParam, boolParam, email, id, mediaUrl, money, paginationSchemaRef, password, plainText, slug } from "./common";

const text = (max: number) => z.string().trim().max(max);
const optNull = <T extends z.ZodType>(s: T) => s.nullable().optional();

const seo = { seoTitle: optNull(text(160)), seoDescription: optNull(text(320)), ogImageUrl: optNull(mediaUrl) };

// ── taxonomy ──
export const categoryBody = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slug.optional(),
  parentId: id.nullable().optional(),
  description: optNull(text(1000)),
  imageUrl: optNull(mediaUrl),
  bannerUrl: optNull(mediaUrl),
  iconName: optNull(text(40)),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  seoKeywords: z.array(text(60)).max(20).optional(),
  canonicalUrl: optNull(z.string().url()),
  ...seo,
});
export const updateCategoryBody = categoryBody.partial().strict();
export const reorderBody = z.object({ items: z.array(z.object({ id, sortOrder: z.number().int().min(0).max(100_000) })).min(1).max(500) });

export const brandBody = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slug.optional(),
  description: optNull(text(1000)),
  logoUrl: optNull(mediaUrl),
  bannerUrl: optNull(mediaUrl),
  websiteUrl: optNull(z.string().url()),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  seoKeywords: z.array(text(60)).max(20).optional(),
  ...seo,
});
export const updateBrandBody = brandBody.partial().strict();

export const collectionBody = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slug.optional(),
  description: optNull(text(1000)),
  imageUrl: optNull(mediaUrl),
  bannerUrl: optNull(mediaUrl),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  sortOrder: z.number().int().optional(),
  productIds: z.array(id).max(500).optional(),
  ...seo,
});
export const updateCollectionBody = collectionBody.partial().strict();

// ── products ──
export const adminProductsQuery = z.object({ search: z.string().trim().max(100).optional(), status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(), categoryId: id.optional(), ...paginationSchemaRef });
export const variantPatchBody = z
  .object({ price: money, compareAtPrice: money.nullable(), costPrice: money.nullable(), name: text(160), isActive: z.boolean(), isDefault: z.boolean(), weightGrams: z.number().int().min(0), taxRateBps: z.number().int().min(0).max(10_000).nullable(), barcode: text(64), sortOrder: z.number().int() })
  .partial()
  .strict();

// ── inventory ──
export const adjustStockBody = z.object({ variantId: id, delta: z.number().int().refine((n) => n !== 0, "delta cannot be 0").refine((n) => Math.abs(n) <= 1_000_000, "delta too large"), type: z.enum(["ADJUSTMENT", "DAMAGE", "CORRECTION", "RESTOCK"]).default("ADJUSTMENT"), reason: plainText(300, 3) });
export const receiveStockBody = z.object({ reference: z.string().trim().min(3).max(60), supplier: text(120).optional(), note: text(300).optional(), items: z.array(z.object({ variantId: id, quantity: z.number().int().min(1).max(1_000_000), unitCost: money.optional() })).min(1).max(200) });
export const inventoryQuery = z.object({ search: z.string().trim().max(100).optional(), lowStockOnly: boolParam.optional(), ...paginationSchemaRef });
export const movementsQuery = z.object({ variantId: id.optional(), type: z.enum(["RESTOCK", "SALE", "RESERVE", "RELEASE", "ADJUSTMENT", "RETURN", "DAMAGE", "CORRECTION"]).optional(), ...paginationSchemaRef });
export const thresholdBody = z.object({ lowStockThreshold: z.number().int().min(0).max(100_000).optional(), allowBackorder: z.boolean().optional() });

// ── customers ──
export const customersQuery = z.object({ search: z.string().trim().max(100).optional(), status: z.enum(["ACTIVE", "SUSPENDED", "BANNED", "PENDING_VERIFICATION", "DELETED"]).optional(), sort: z.enum(["newest", "spend", "orders"]).default("newest"), ...paginationSchemaRef });
export const customerStatusBody = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]), reason: plainText(300).optional() });

// ── coupons ──
export const couponBody = z.object({
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only"),
  description: optNull(text(200)),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"]),
  value: z.number().int().min(0).max(2_000_000_000),
  minSubtotal: money.optional(),
  maxDiscount: optNull(money),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
  firstOrderOnly: z.boolean().optional(),
  isStackable: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  restrictedToUserId: id.nullable().optional(),
  productIds: z.array(id).max(200).optional(),
  categoryIds: z.array(id).max(100).optional(),
});
export const updateCouponBody = couponBody.partial().strict();
export const couponsQuery = z.object({ search: z.string().trim().max(60).optional(), active: boolParam.optional(), ...paginationSchemaRef });

// ── staff / roles / settings ──
export const staffBody = z.object({ name: plainText(80, 2), email, password, roleKey: z.string().min(2).max(40) });
export const roleChangeBody = z.object({ roleKey: z.string().min(2).max(40) });
export const rolePermissionsBody = z.object({ permissions: z.array(z.string().max(60)).max(100) });
export const settingBody = z.object({ value: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown()), z.string(), z.number(), z.boolean()]), isPublic: z.boolean().optional() });
export const settingKeyParams = z.object({ key: z.string().regex(/^[a-z0-9_.-]{2,60}$/) });

// ── content ──
export const blockBody = z.object({
  type: z.enum(["HERO", "BANNER", "PROMO", "CAMPAIGN", "ANNOUNCEMENT"]),
  placement: z.string().trim().regex(/^[a-z0-9_.:\-]{2,60}$/),
  title: z.string().trim().min(1).max(200),
  subtitle: optNull(text(300)),
  mediaUrl: optNull(mediaUrl),
  mobileMediaUrl: optNull(mediaUrl),
  mediaAlt: optNull(text(200)),
  ctaLabel: optNull(text(60)),
  ctaUrl: optNull(z.string().max(500).refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), "Must be a site path or http(s) URL")),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  sortOrder: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export const updateBlockBody = blockBody.partial().strict();
export const sectionBody = z.object({
  key: z.string().trim().regex(/^[a-z0-9_-]{2,40}$/),
  type: z.enum(["HERO", "CATEGORY_RAIL", "PRODUCT_RAIL", "CONTENT_BLOCKS", "COLLECTION", "RECENTLY_VIEWED", "PERSONALIZED", "TRUST_BADGES", "CUSTOM"]),
  title: optNull(text(120)),
  subtitle: optNull(text(300)),
  config: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

// ── analytics / audit ──
const today = () => new Date();
export const rangeQuery = z.object({ from: z.coerce.date().default(() => new Date(today().getTime() - 29 * 86_400_000)), to: z.coerce.date().default(today), granularity: z.enum(["day", "week", "month"]).default("day"), limit: z.coerce.number().int().min(1).max(50).default(10) }).refine((r) => r.to >= r.from, "to must not be before from").refine((r) => r.to.getTime() - r.from.getTime() <= 400 * 86_400_000, "Range cannot exceed 400 days");
export const auditQuery = z.object({ actorId: id.optional(), action: z.string().max(60).optional(), resourceType: z.string().max(40).optional(), resourceId: z.string().max(64).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), ...paginationSchemaRef, pageSize: z.coerce.number().int().min(1).max(100).default(50) });

// ── reviews / support ──
export const adminReviewsQuery = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(), productId: id.optional(), ...paginationSchemaRef });
export const answerBody = z.object({ body: plainText(2000, 2) });
export const questionsQuery = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(), ...paginationSchemaRef });
export const ticketsQuery = z.object({ status: z.enum(["OPEN", "PENDING_CUSTOMER", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(), search: z.string().trim().max(60).optional(), ...paginationSchemaRef });
export const staffReplyBody = z.object({ message: plainText(4000, 1), status: z.enum(["OPEN", "PENDING_CUSTOMER", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional() });
export const ticketStatusBody = z.object({ status: z.enum(["OPEN", "PENDING_CUSTOMER", "IN_PROGRESS", "RESOLVED", "CLOSED"]) });
export const returnsQuery = z.object({ status: arrayParam(z.enum(["REQUESTED", "APPROVED", "REJECTED", "PICKUP_SCHEDULED", "PICKED_UP", "RECEIVED", "REFUND_PENDING", "COMPLETED", "CANCELLED"])).optional(), ...paginationSchemaRef });
export const uploadSignBody = z.object({ contentType: z.string().max(60), folder: z.string().max(60).default("products") });
