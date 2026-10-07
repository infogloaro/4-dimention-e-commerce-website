import { z } from "zod";
import { arrayParam, boolParam, id, mediaUrl, money, paginationSchemaRef, slug } from "./common";
import { SORTS } from "../services/catalog/listing";

const optionInput = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{1,40}$/),
  name: z.string().trim().min(1).max(60).optional(),
  value: z.string().trim().min(1).max(80),
  swatch: z.string().trim().max(200).optional(),
});

export const variantInput = z.object({
  sku: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9._\-]+$/, "SKU may only contain letters, numbers, . _ -"),
  name: z.string().trim().max(160).optional(),
  barcode: z.string().trim().max(64).optional(),
  price: money,
  compareAtPrice: money.nullable().optional(),
  costPrice: money.nullable().optional(),
  weightGrams: z.number().int().min(0).max(1_000_000).default(0),
  taxRateBps: z.number().int().min(0).max(10_000).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  options: z.array(optionInput).max(6).default([]),
  stock: z
    .object({
      quantity: z.number().int().min(0).max(10_000_000).default(0),
      lowStockThreshold: z.number().int().min(0).max(100_000).default(5),
      allowBackorder: z.boolean().default(false),
    })
    .default({ quantity: 0, lowStockThreshold: 5, allowBackorder: false }),
});

export const mediaInput = z.object({
  type: z.enum(["IMAGE", "VIDEO", "MODEL_3D"]).default("IMAGE"),
  url: mediaUrl,
  thumbnailUrl: mediaUrl.optional(),
  alt: z.string().trim().max(200).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSec: z.number().int().positive().optional(),
  isPrimary: z.boolean().optional(),
  variantSku: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

const seo = {
  seoTitle: z.string().trim().max(160).optional(),
  seoDescription: z.string().trim().max(320).optional(),
  seoKeywords: z.array(z.string().trim().max(60)).max(20).optional(),
  ogImageUrl: mediaUrl.optional(),
  canonicalUrl: z.string().url().optional(),
};

const productFields = {
  name: z.string().trim().min(2).max(200),
  slug: slug,
  shortDescription: z.string().trim().max(500),
  description: z.string().trim().max(20_000),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  brandId: id.nullable(),
  categoryId: id,
  productType: z.string().trim().max(40),
  taxRatePercent: z.number().min(0).max(100),
  hsnCode: z.string().trim().max(20),
  maxQuantityPerOrder: z.number().int().min(1).max(100),
  isFeatured: z.boolean(),
  isBestseller: z.boolean(),
  isNewArrival: z.boolean(),
  badges: z.array(z.string().trim().min(1).max(30)).max(5),
  highlights: z.array(z.string().trim().min(1).max(200)).max(10),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  attributes: z
    .array(z.object({ key: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{1,40}$/), name: z.string().trim().max(60).optional(), group: z.string().trim().max(60).optional(), unit: z.string().trim().max(20).optional(), value: z.string().trim().min(1).max(300), filterable: z.boolean().optional() }))
    .max(60),
  ...seo,
};

export const createProductBody = z.object({
  name: productFields.name,
  categoryId: productFields.categoryId,
  slug: productFields.slug.optional(),
  shortDescription: productFields.shortDescription.optional(),
  description: productFields.description.optional(),
  status: productFields.status.default("DRAFT"),
  brandId: productFields.brandId.optional(),
  productType: productFields.productType.default("physical"),
  taxRatePercent: productFields.taxRatePercent.default(18),
  hsnCode: productFields.hsnCode.optional(),
  maxQuantityPerOrder: productFields.maxQuantityPerOrder.default(10),
  isFeatured: z.boolean().default(false),
  isBestseller: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),
  badges: productFields.badges.default([]),
  highlights: productFields.highlights.default([]),
  tags: productFields.tags.default([]),
  attributes: productFields.attributes.default([]),
  seoTitle: seo.seoTitle,
  seoDescription: seo.seoDescription,
  seoKeywords: seo.seoKeywords,
  ogImageUrl: seo.ogImageUrl,
  canonicalUrl: seo.canonicalUrl,
  variants: z.array(variantInput).min(1).max(100),
  media: z.array(mediaInput).max(30).default([]),
});

export const updateProductBody = z
  .object({ ...productFields, media: z.array(mediaInput).max(30) })
  .partial()
  .strict();

export const bulkProductsBody = z.object({
  ids: z.array(id).min(1).max(200),
  action: z.enum(["publish", "unpublish", "archive", "feature", "unfeature", "set_category", "adjust_price_percent"]),
  categoryId: id.optional(),
  percent: z.number().min(-90).max(500).optional(),
});

export const listingQuery = z
  .looseObject({
    q: z.string().trim().max(100).optional(),
    category: z.string().max(160).optional(),
    brand: arrayParam(z.string()).optional(),
    collection: z.string().max(160).optional(),
    tag: arrayParam(z.string()).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    inStock: boolParam.optional(),
    minDiscount: z.coerce.number().int().min(0).max(100).optional(),
    productType: arrayParam(z.string()).optional(),
    featured: boolParam.optional(),
    bestseller: boolParam.optional(),
    newArrival: boolParam.optional(),
    sort: z.enum(SORTS).default("relevance"),
    facets: boolParam.default(true),
    ...paginationSchemaRef,
  })
  .transform((raw) => {
    const attrs: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith("attr.") && (typeof v === "string" || Array.isArray(v))) {
        attrs[k.slice(5)] = (Array.isArray(v) ? v : String(v).split(",")).map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
      }
    }
    return { ...raw, attrs };
  });

