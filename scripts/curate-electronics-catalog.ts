import "dotenv/config";
import { db, disconnectDb } from "../server/db/client";
import { containsProhibitedCategoryTerm } from "../server/domain/electronics-policy";
import { slugify } from "../server/core/text";
import { createProduct } from "../server/services/catalog/admin-products";
import { PERMISSIONS } from "../server/auth/permissions";
import { CATEGORIES, BRANDS, PRODUCTS, ATTRIBUTES } from "../prisma/seed-data";
import type { AuthUser } from "../server/auth/session";

const rupees = (n: number) => Math.round(n * 100);

async function main() {
  console.log("[curate] Starting electronics catalog curation...");

  // 1. Soft-archive existing non-electronics categories and products safely
  const allCategories = await db.category.findMany();
  let archivedCategories = 0;
  for (const cat of allCategories) {
    if (containsProhibitedCategoryTerm(cat.name) || containsProhibitedCategoryTerm(cat.slug)) {
      if (cat.isActive) {
        await db.category.update({
          where: { id: cat.id },
          data: { isActive: false, isFeatured: false },
        });
        archivedCategories++;
      }
    }
  }
  console.log(`[curate] Deactivated ${archivedCategories} non-electronics categories.`);

  const allProducts = await db.product.findMany({
    where: { deletedAt: null },
    include: { category: true },
  });
  let archivedProducts = 0;
  for (const prod of allProducts) {
    if (
      containsProhibitedCategoryTerm(prod.name) ||
      containsProhibitedCategoryTerm(prod.category.name) ||
      containsProhibitedCategoryTerm(prod.category.slug)
    ) {
      await db.product.update({
        where: { id: prod.id },
        data: { status: "ARCHIVED", deletedAt: new Date(), isFeatured: false, isBestseller: false, isNewArrival: false },
      });
      archivedProducts++;
    }
  }
  console.log(`[curate] Soft-archived ${archivedProducts} non-electronics products (order history preserved).`);

  // 2. Ensure system attributes exist
  for (const a of ATTRIBUTES) {
    await db.attribute.upsert({
      where: { key: a.key },
      create: { key: a.key, name: a.name, kind: a.kind, isFilterable: true },
      update: {},
    });
  }

  // 3. Ensure new electronics categories exist
  const catIds = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    let parent = await db.category.findUnique({ where: { slug: c.slug } });
    if (!parent) {
      parent = await db.category.create({
        data: {
          name: c.name,
          slug: c.slug,
          description: c.description,
          iconName: c.icon,
          isFeatured: !!c.featured,
          sortOrder: i,
          path: c.slug,
          depth: 0,
          imageUrl: `https://picsum.photos/seed/cat-${c.slug}/600/600`,
          bannerUrl: `https://picsum.photos/seed/cat-banner-${c.slug}/1600/500`,
          seoTitle: `${c.name} | 4D Commerce`,
          seoDescription: c.description,
        },
      });
    }
    catIds.set(c.slug, parent.id);

    for (const [j, ch] of (c.children ?? []).entries()) {
      let child = await db.category.findUnique({ where: { slug: ch.slug } });
      if (!child) {
        child = await db.category.create({
          data: {
            name: ch.name,
            slug: ch.slug,
            description: ch.description,
            iconName: ch.icon,
            isFeatured: !!ch.featured,
            sortOrder: j,
            parentId: parent.id,
            path: `${c.slug}/${ch.slug}`,
            depth: 1,
            imageUrl: `https://picsum.photos/seed/cat-${ch.slug}/600/600`,
            bannerUrl: `https://picsum.photos/seed/cat-banner-${ch.slug}/1600/500`,
          },
        });
      } else {
        await db.category.update({
          where: { id: child.id },
          data: { isActive: true, isFeatured: !!ch.featured, sortOrder: j },
        });
      }
      catIds.set(ch.slug, child.id);
    }
  }

  // 4. Ensure electronics brands exist
  const brandIds = new Map<string, string>();
  for (const b of BRANDS) {
    let row = await db.brand.findUnique({ where: { slug: b.slug } });
    if (!row) {
      row = await db.brand.create({
        data: {
          name: b.name,
          slug: b.slug,
          description: b.description,
          isFeatured: !!b.featured,
          logoUrl: `https://picsum.photos/seed/brand-${b.slug}/240/120`,
          bannerUrl: `https://picsum.photos/seed/brand-banner-${b.slug}/1600/400`,
        },
      });
    }
    brandIds.set(b.slug, row.id);
  }

  // 5. Seed missing electronics products
  const adminRow = await db.user.findFirst({ where: { role: { key: "admin" } } });
  if (!adminRow) {
    console.log("[curate] No admin user found; skipping product creation.");
    return;
  }
  const actor: AuthUser = {
    id: adminRow.id,
    email: adminRow.email,
    name: adminRow.name,
    phone: null,
    avatarUrl: null,
    status: "ACTIVE",
    emailVerified: true,
    phoneVerified: false,
    roleKey: "admin",
    isStaff: true,
    permissions: new Set(PERMISSIONS),
    sessionId: "curate",
  };

  const skuSeen = new Set<string>();
  const existingSkus = await db.productVariant.findMany({ select: { sku: true } });
  for (const s of existingSkus) skuSeen.add(s.sku.toLowerCase());

  let addedProducts = 0;
  for (const p of PRODUCTS) {
    const slug = slugify(p.name);
    const existing = await db.product.findUnique({ where: { slug } });
    if (existing) {
      if (existing.deletedAt) {
        await db.product.update({ where: { id: existing.id }, data: { status: "ACTIVE", deletedAt: null } });
      }
      continue;
    }

    const combos: Array<{ opts: Array<{ key: string; value: string; swatch?: string }>; delta: number; label: string[] }> = [{ opts: [], delta: 0, label: [] }];
    const expand = (key: string, values: Array<{ value: string; swatch?: string; delta?: number }>) => {
      if (!values.length) return;
      const base = combos.splice(0, combos.length);
      for (const c of base) for (const v of values) combos.push({ opts: [...c.opts, { key, value: v.value, swatch: v.swatch }], delta: c.delta + (v.delta ?? 0), label: [...c.label, v.value] });
    };
    expand("color", (p.axes.color ?? []).map(([value, swatch]) => ({ value, swatch })));
    expand("storage", (p.axes.storage ?? []).map(([value, d]) => ({ value, delta: rupees(d) })));
    expand("memory", (p.axes.memory ?? []).map(([value, d]) => ({ value, delta: rupees(d) })));
    expand("size", (p.axes.size ?? []).map((value) => ({ value })));

    const mrpRatio = p.mrp ? p.mrp / p.price : 1;
    const variants = combos.map((c, idx) => {
      let sku = `${slug.split("-").map((w) => w[0]).join("").toUpperCase()}-${slugify(c.label.join("-")).toUpperCase().slice(0, 18) || "STD"}`.replace(/-+$/, "");
      while (skuSeen.has(sku.toLowerCase())) sku += "X";
      skuSeen.add(sku.toLowerCase());
      const price = rupees(p.price) + c.delta;
      return {
        sku,
        name: c.label.join(" / ") || undefined,
        price,
        compareAtPrice: p.mrp ? Math.round(price * mrpRatio) : null,
        costPrice: Math.round(price * 0.62),
        weightGrams: p.weight ?? 500,
        isActive: true,
        isDefault: idx === 0,
        sortOrder: idx,
        options: c.opts,
        stock: { quantity: (p.stock ?? 20) + (idx % 5) * 3, lowStockThreshold: 5, allowBackorder: false },
      };
    });

    const media = Array.from({ length: 4 }, (_, i) => ({
      type: "IMAGE" as const,
      url: `https://picsum.photos/seed/${slug}-${i + 1}/1000/1000`,
      thumbnailUrl: `https://picsum.photos/seed/${slug}-${i + 1}/300/300`,
      alt: `${p.name} — angle ${i + 1}`,
      width: 1000,
      height: 1000,
      isPrimary: i === 0,
      sortOrder: i,
    }));

    await createProduct(actor, {
      name: p.name,
      slug,
      categoryId: catIds.get(p.cat)!,
      brandId: brandIds.get(p.brand)!,
      shortDescription: p.short,
      description: p.description,
      status: "ACTIVE",
      productType: "physical",
      taxRatePercent: p.tax ?? 18,
      maxQuantityPerOrder: 10,
      isFeatured: !!p.flags?.featured,
      isBestseller: !!p.flags?.bestseller,
      isNewArrival: !!p.flags?.new,
      badges: p.badges ?? [],
      highlights: p.highlights,
      tags: p.tags,
      attributes: Object.entries(p.specs).flatMap(([group, rows]) =>
        Object.entries(rows).map(([name, value]) => ({
          key: slugify(name).replace(/-/g, "_"),
          name,
          group,
          value,
          filterable: false,
        }))
      ),
      variants,
      media,
      seoTitle: `${p.name} | 4D Commerce`,
      seoDescription: p.short,
    });
    addedProducts++;
  }

  console.log(`[curate] Added ${addedProducts} new electronics products.`);
  console.log("[curate] Electronics catalog curation complete!");
}

main()
  .catch((e) => {
    console.error("[curate] error:", e);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());

