import type { db as Db } from "../server/db/client";
import { ART_KIND_BY_SLUG, CATEGORY_KIND, categoryArtUrl, normaliseHex, productArtUrl, productMediaFor } from "./product-art";

/**
 * Points every product, variant, category, brand, collection and CMS block at artwork that matches it (see product-art.ts)
 * and removes the old picsum.photos URLs. Idempotent; safe to run after seeding, curation or on a live database.
 * Returns a summary and the slugs it could not map (those products are left untouched and need manual attention).
 */
export async function applyProductArt(db: typeof Db) {
  const products = await db.product.findMany({
    where: { deletedAt: null },
    select: { id: true, slug: true, name: true, variants: { select: { id: true, options: { select: { value: true, swatch: true, attribute: { select: { key: true } } } } } } },
  });

  let fixed = 0;
  const unmapped: string[] = [];
  for (const p of products) {
    if (!ART_KIND_BY_SLUG[p.slug]) { unmapped.push(`${p.slug} (${p.name})`); continue; }
    await db.$transaction(async (tx) => {
      await tx.productMedia.deleteMany({ where: { productId: p.id } });
      await tx.productMedia.createMany({ data: productMediaFor(p.slug, p.name).map((m) => ({ ...m, productId: p.id })) });
      const colourRows = p.variants.flatMap((v) => {
        const opt = v.options.find((o) => o.attribute.key === "color");
        const hex = normaliseHex(opt?.swatch); // the catalogue's own swatch decides the colour; no swatch → no variant image
        return opt && hex ? [{ variantId: v.id, colour: opt.value, hex }] : [];
      });
      if (colourRows.length) {
        await tx.productMedia.createMany({
          data: colourRows.map((r, i) => {
            const url = productArtUrl(p.slug, `colour-${r.hex}`);
            return { productId: p.id, variantId: r.variantId, type: "IMAGE" as const, url, thumbnailUrl: url, alt: `${p.name} — ${r.colour}`, width: 1000, height: 1000, isPrimary: false, sortOrder: 10 + i };
          }),
        });
      }
    });
    fixed++;
  }

  // category tiles (active categories with a mapped kind) — everything else drops its picsum URL
  let categories = 0;
  for (const c of await db.category.findMany({ select: { id: true, slug: true, imageUrl: true, bannerUrl: true } })) {
    if (CATEGORY_KIND[c.slug]) {
      await db.category.update({ where: { id: c.id }, data: { imageUrl: categoryArtUrl(c.slug), bannerUrl: null } });
      categories++;
    } else if (c.imageUrl?.includes("picsum.photos") || c.bannerUrl?.includes("picsum.photos")) {
      await db.category.update({ where: { id: c.id }, data: { imageUrl: null, bannerUrl: null } });
    }
  }
  const brands = await db.brand.updateMany({ where: { OR: [{ logoUrl: { contains: "picsum.photos" } }, { bannerUrl: { contains: "picsum.photos" } }] }, data: { logoUrl: null, bannerUrl: null } });
  const collections = await db.collection.updateMany({ where: { OR: [{ imageUrl: { contains: "picsum.photos" } }, { bannerUrl: { contains: "picsum.photos" } }] }, data: { imageUrl: null, bannerUrl: null } });
  const blocks = await db.contentBlock.updateMany({ where: { OR: [{ mediaUrl: { contains: "picsum.photos" } }, { mobileMediaUrl: { contains: "picsum.photos" } }] }, data: { mediaUrl: null, mobileMediaUrl: null } });

  // legacy (archived, non-electronics) products: the picsum media was never of the product, so drop it rather than show a stranger
  const legacy = await db.productMedia.deleteMany({ where: { url: { contains: "picsum.photos" } } });

  // order-item snapshots captured from the wrong data
  let snapshots = 0;
  const bad = await db.orderItem.findMany({ where: { imageUrl: { contains: "picsum.photos" } }, select: { id: true, productId: true, variantId: true } });
  for (const oi of bad) {
    const variantMedia = oi.variantId ? await db.productMedia.findFirst({ where: { variantId: oi.variantId }, orderBy: { sortOrder: "asc" }, select: { url: true } }) : null;
    const productMedia = oi.productId ? await db.productMedia.findFirst({ where: { productId: oi.productId, variantId: null }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], select: { url: true } }) : null;
    // null → the storefront shows a neutral placeholder; an archived product has no verifiable image
    await db.orderItem.update({ where: { id: oi.id }, data: { imageUrl: variantMedia?.url ?? productMedia?.url ?? null } });
    snapshots++;
  }

  return { productsFixed: fixed, categoriesFixed: categories, brandsCleared: brands.count, collectionsCleared: collections.count, contentBlocksCleared: blocks.count, orderItemSnapshotsRepaired: snapshots, legacyMediaRowsRemoved: legacy.count, unmappedProducts: unmapped };
}
