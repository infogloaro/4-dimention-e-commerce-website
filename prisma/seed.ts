/**
 * Database seed.  `npm run db:seed`
 *  - ALWAYS: roles, permissions, shipping, store settings (safe for production).
 *  - Non-production only: demo staff/customers, catalogue, coupons, content, sample orders & reviews.
 * Demo credentials come from SEED_* env vars and are for DEVELOPMENT ONLY.
 */
import "dotenv/config";
import { db, disconnectDb } from "../server/db/client";
import { hashPassword } from "../server/core/crypto";
import { PERMISSIONS } from "../server/auth/permissions";
import type { AuthUser } from "../server/auth/session";
import { slugify } from "../server/core/text";
import { createProduct } from "../server/services/catalog/admin-products";
import { createCheckout } from "../server/services/checkout";
import { transitionOrder } from "../server/services/orders";
import { createReview, moderateReview } from "../server/services/reviews";
import { createAddress } from "../server/services/customer";
import { confirmPayment } from "../server/services/payments";
import { mockSign } from "../server/integrations/payments/mock";
import { reindexProduct } from "../server/services/catalog/admin-products";
import { applyProductArt } from "./apply-product-art";
import { productMediaFor, categoryArtUrl } from "./product-art";
import { seedRbac, seedShipping, seedSettings } from "./seed-base";
import { ATTRIBUTES, BRANDS, CATEGORIES, COUPONS, PRODUCTS, SYNONYMS } from "./seed-data";

const isProd = process.env.NODE_ENV === "production";
const rupees = (n: number) => Math.round(n * 100);
const log = (m: string) => process.stdout.write(`[seed] ${m}\n`);

async function seedDemo() {
  if (isProd) {
    log("production: skipping demo accounts and catalogue");
    return;
  }
  if (await db.product.count()) {
    log("catalogue already present — skipping demo data (run `npm run db:reset` for a clean slate)");
    return;
  }
  const adminPw = process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345";
  const custPw = process.env.SEED_CUSTOMER_PASSWORD ?? "Customer@12345";
  const roles = new Map((await db.role.findMany()).map((r) => [r.key, r.id]));
  const [adminHash, custHash] = [await hashPassword(adminPw), await hashPassword(custPw)];

  // ── staff (one per role, all DEV-ONLY) ──
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@4dcommerce.dev";
  const staff: Array<[string, string, string]> = [
    [adminEmail, "Asha Admin", "admin"],
    ["superadmin@4dcommerce.dev", "Sam Super", "super_admin"],
    ["manager@4dcommerce.dev", "Maya Manager", "manager"],
    ["products@4dcommerce.dev", "Pranav Products", "product_manager"],
    ["orders@4dcommerce.dev", "Olivia Orders", "order_manager"],
    ["inventory@4dcommerce.dev", "Ishaan Inventory", "inventory_manager"],
    ["support@4dcommerce.dev", "Sara Support", "support_agent"],
  ];
  for (const [email, name, role] of staff) {
    await db.user.create({ data: { email, name, passwordHash: adminHash, roleId: roles.get(role)!, emailVerifiedAt: new Date(), status: "ACTIVE" } });
  }
  const customers = [
    ["aarav@example.com", "Aarav Sharma", "+919810000001"],
    ["meera@example.com", "Meera Iyer", "+919810000002"],
    ["rohan@example.com", "Rohan Das", "+919810000003"],
    ["zoya@example.com", "Zoya Khan", "+919810000004"],
    ["neha@example.com", "Neha Verma", "+919810000005"],
  ] as const;
  const customerRows: Array<Awaited<ReturnType<typeof db.user.create>>> = [];
  for (const [email, name, phone] of customers) {
    customerRows.push(await db.user.create({ data: { email, name, phone, passwordHash: custHash, roleId: roles.get("customer")!, emailVerifiedAt: new Date(), phoneVerifiedAt: new Date(), marketingOptIn: true } }));
  }
  log(`users created: ${staff.length} staff + ${customerRows.length} customers (DEVELOPMENT-ONLY credentials)`);

  const adminRow = await db.user.findUniqueOrThrow({ where: { email: adminEmail }, include: { role: true } });
  const actor: AuthUser = { id: adminRow.id, email: adminRow.email, name: adminRow.name, phone: null, avatarUrl: null, status: "ACTIVE", emailVerified: true, phoneVerified: false, roleKey: "admin", isStaff: true, permissions: new Set(PERMISSIONS), sessionId: "seed" };

  // ── taxonomy ──
  const catIds = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const parent = await db.category.create({ data: { name: c.name, slug: c.slug, description: c.description, iconName: c.icon, isFeatured: !!c.featured, sortOrder: i, path: c.slug, depth: 0, imageUrl: categoryArtUrl(c.slug), seoTitle: `${c.name} | 4D Commerce`, seoDescription: c.description } });
    catIds.set(c.slug, parent.id);
    for (const [j, ch] of (c.children ?? []).entries()) {
      const child = await db.category.create({ data: { name: ch.name, slug: ch.slug, description: ch.description, iconName: ch.icon, isFeatured: !!ch.featured, sortOrder: j, parentId: parent.id, path: `${c.slug}/${ch.slug}`, depth: 1, imageUrl: categoryArtUrl(ch.slug) } });
      catIds.set(ch.slug, child.id);
    }
  }
  const brandIds = new Map<string, string>();
  for (const b of BRANDS) {
    const row = await db.brand.create({ data: { name: b.name, slug: b.slug, description: b.description, isFeatured: !!b.featured } });
    brandIds.set(b.slug, row.id);
  }
  for (const a of ATTRIBUTES) await db.attribute.create({ data: { key: a.key, name: a.name, kind: a.kind, isFilterable: true } });
  for (const s of SYNONYMS) await db.searchSynonym.create({ data: s });

  // ── products via the real service (variants, stock, tags, specs, search index, aggregates) ──
  const productIds: string[] = [];
  const skuSeen = new Set<string>();
  for (const p of PRODUCTS) {
    const slug = slugify(p.name);
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
      while (skuSeen.has(sku)) sku += "X";
      skuSeen.add(sku);
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
        stock: { quantity: idx % 7 === 6 ? 0 : (p.stock ?? 20) + (idx % 5) * 3, lowStockThreshold: 5, allowBackorder: false },
      };
    });
    const media = productMediaFor(slug, p.name);
    const created = await createProduct(actor, {
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
      attributes: Object.entries(p.specs).flatMap(([group, rows]) => Object.entries(rows).map(([name, value]) => ({ key: slugify(name).replace(/-/g, "_"), name, group, value, filterable: false }))),
      variants,
      media,
      seoTitle: `${p.name} | 4D Commerce`,
      seoDescription: p.short,
    });
    productIds.push(created.id);
  }
  log(`${PRODUCTS.length} products created`);
  // variant (colour) artwork + category tiles — must exist before sample orders snapshot their item images
  const art = await applyProductArt(db);
  if (art.unmappedProducts.length) throw new Error(`Products without artwork mapping: ${art.unmappedProducts.join(", ")}`);

  // curated relations & collections
  const bySlug = new Map((await db.product.findMany({ select: { id: true, slug: true } })).map((p) => [p.slug, p.id]));
  const rel = (a: string, b: string, type: "ACCESSORY" | "RELATED") => bySlug.has(a) && bySlug.has(b) ? db.productRelation.create({ data: { productId: bySlug.get(a)!, relatedProductId: bySlug.get(b)!, type } }) : null;
  await Promise.all([rel("nimbus-nova-5-pro", "aurora-buds-air-2", "ACCESSORY"), rel("nimbus-nova-5-pro", "kora-pulse-smartwatch", "ACCESSORY"), rel("voltix-aero-14-ultrabook", "aurora-studio-anc-headphones", "ACCESSORY"), rel("voltix-aero-14-ultrabook", "hyperdrive-140w-gan-fast-charger", "ACCESSORY")].filter(Boolean));
  const collections = [
    { name: "Pro Creator Desk Setup", slug: "pro-creator-desk-setup", description: "OLED laptops, 4K displays, studio audio and high-throughput storage.", slugs: ["voltix-aero-14-ultrabook", "horizon-ultra-32-4k-oled-pro-display", "aurora-studio-anc-headphones", "hyperdrive-gen4-2tb-nvme-ssd", "hyperdrive-140w-gan-fast-charger"], featured: true },
    { name: "Competitive Gaming Rig", slug: "competitive-gaming-rig", description: "240Hz monitors, rapid mechanical keyboards and RTX graphics.", slugs: ["horizon-vision-27-qhd-240hz-gaming-monitor", "quantum-strike-mechanical-gaming-keyboard", "quantum-swift-wireless-gaming-mouse", "apex-core-x9-desktop-processor", "apex-phantom-rtx-4080-graphics-card"], featured: true },
    { name: "Flagship Mobile Studio", slug: "flagship-mobile-studio", description: "5G smartphones, OLED tablets, smartwatches and lossless audio.", slugs: ["nimbus-nova-5-pro", "nimbus-tab-11-ultra", "aurora-buds-air-2", "kora-pulse-smartwatch"], featured: false },
  ];
  for (const [i, c] of collections.entries()) {
    const col = await db.collection.create({ data: { name: c.name, slug: c.slug, description: c.description, isFeatured: c.featured, sortOrder: i } });
    await db.collectionProduct.createMany({ data: c.slugs.filter((s) => bySlug.has(s)).map((s, k) => ({ collectionId: col.id, productId: bySlug.get(s)!, sortOrder: k })) });
  }

  // ── coupons ──
  for (const c of COUPONS) {
    const { category, ...rest } = c as typeof c & { category?: string };
    const row = await db.coupon.create({ data: { ...rest, endsAt: new Date(Date.now() + 180 * 86_400_000) } });
    if (category) await db.couponCategory.create({ data: { couponId: row.id, categoryId: catIds.get(category)! } });
  }

  // ── CMS: announcement bar, hero, promos, home sections ──
  await db.contentBlock.createMany({
    data: [
      { type: "ANNOUNCEMENT", placement: "site.announcement", title: "Free express delivery across India above ₹999 · Extra 10% off with WELCOME10", ctaLabel: "Shop now", ctaUrl: "/products", sortOrder: 0 },
      { type: "HERO", placement: "home.hero", title: "Four Dimension Electronics. Engineered in motion.", subtitle: "Discover flagship smartphones, creator laptops, calibrated OLED displays and audiophile sound.", mediaAlt: "4D Commerce electronics hero", ctaLabel: "Explore the collection", ctaUrl: "/products", sortOrder: 0, metadata: { theme: "dark", align: "left" } },
      { type: "HERO", placement: "home.hero", title: "Acoustic Purity. Zero Noise.", subtitle: "Studio-tuned ANC headphones with lossless LDAC streaming, now up to 24% off.", mediaAlt: "Aurora headphones", ctaLabel: "Shop audio", ctaUrl: "/category/audio", sortOrder: 1, metadata: { theme: "dark", align: "right" } },
      { type: "PROMO", placement: "home.promo", title: "Creator Desk Setup", subtitle: "OLED laptops, 4K monitors & fast NVMe storage", ctaLabel: "View collection", ctaUrl: "/collections/pro-creator-desk-setup", sortOrder: 0 },
      { type: "PROMO", placement: "home.promo", title: "Competitive Gaming Rig", subtitle: "240Hz monitors, rapid keyboards & RTX graphics", ctaLabel: "View collection", ctaUrl: "/collections/competitive-gaming-rig", sortOrder: 1 },
      { type: "BANNER", placement: "home.flash", title: "Electronics Flash Deals — ends soon", subtitle: "Up to 30% off selected headphones, chargers & monitors", ctaLabel: "Grab the deals", ctaUrl: "/products?sort=discount", endsAt: new Date(Date.now() + 3 * 86_400_000), sortOrder: 0 },
    ],
  });
  await db.homeSection.createMany({
    data: [
      { key: "hero", type: "HERO", sortOrder: 0, config: { placement: "home.hero" } },
      { key: "categories", type: "CATEGORY_RAIL", title: "Shop by category", sortOrder: 1, config: { featuredOnly: true, limit: 8 } },
      { key: "trending", type: "PRODUCT_RAIL", title: "Trending now", subtitle: "What everyone is buying this month", sortOrder: 2, config: { source: "trending", limit: 12 } },
      { key: "flash", type: "CONTENT_BLOCKS", title: "Limited-time offers", sortOrder: 3, config: { placement: "home.flash" } },
      { key: "collections", type: "COLLECTION", title: "Curated collections", sortOrder: 4, config: { featuredOnly: true, limit: 3 } },
      { key: "new-arrivals", type: "PRODUCT_RAIL", title: "New arrivals", sortOrder: 5, config: { source: "new", limit: 12 } },
      { key: "bestsellers", type: "PRODUCT_RAIL", title: "Bestsellers", sortOrder: 6, config: { source: "bestsellers", limit: 12 } },
      { key: "for-you", type: "PERSONALIZED", title: "Picked for you", sortOrder: 7, config: { limit: 12 } },
      { key: "recent", type: "RECENTLY_VIEWED", title: "Continue shopping", sortOrder: 8, config: { limit: 12 } },
      { key: "trust", type: "TRUST_BADGES", sortOrder: 9, config: { items: [{ icon: "truck", title: "Express Delivery", text: "Across India above ₹999" }, { icon: "rotate-ccw", title: "10-Day Replacement", text: "Hassle-free doorstep pickup" }, { icon: "shield-check", title: "Secure Payments", text: "UPI, Cards, NetBanking, COD" }, { icon: "headset", title: "Expert Support", text: "Dedicated electronics specialists" }] } },
    ],
  });

  // ── sample customer activity through the real checkout → fulfilment flow ──
  const variantOf = async (slug: string, color?: string) => {
    const v = await db.productVariant.findFirst({ where: { product: { slug }, isActive: true, inventory: { quantity: { gt: 5 } }, ...(color ? { options: { some: { value: color } } } : {}) }, orderBy: { sortOrder: "asc" } });
    if (!v) throw new Error(`seed: no stocked variant for ${slug}`);
    return v.id;
  };
  const addrFor = async (userId: string, name: string, city: string, state: string, postalCode: string) =>
    createAddress(userId, { fullName: name, phone: "+919810000000", line1: "12, Residency Road", line2: "Near Central Park", landmark: undefined, city, state, postalCode, country: "IN", type: "HOME", isDefault: true });

  const [aarav, meera, rohan] = customerRows;
  const [addrA, addrM, addrR] = await Promise.all([addrFor(aarav!.id, aarav!.name, "Mumbai", "Maharashtra", "400050"), addrFor(meera!.id, meera!.name, "Bengaluru", "Karnataka", "560034"), addrFor(rohan!.id, rohan!.name, "Jaipur", "Rajasthan", "302001")]);
  const asUser = (u: (typeof customerRows)[number]): AuthUser => ({ id: u.id, email: u.email, name: u.name, phone: u.phone, avatarUrl: null, status: "ACTIVE", emailVerified: true, phoneVerified: true, roleKey: "customer", isStaff: false, permissions: new Set(), sessionId: "seed" });

  const place = async (u: (typeof customerRows)[number], addressId: string, items: Array<{ slug: string; qty: number; color?: string }>, couponCodes?: string[], method: "COD" | "ONLINE" = "COD") => {
    const res = await createCheckout(asUser(u), { addressId, paymentMethod: method, items: await Promise.all(items.map(async (i) => ({ variantId: await variantOf(i.slug, i.color), quantity: i.qty }))), couponCodes });
    if (res.payment) {
      // online orders go through the real verify → capture → place path using the credential-free MOCK provider
      const pay = await db.payment.findUniqueOrThrow({ where: { id: res.payment.id } });
      await confirmPayment(u.id, { paymentId: pay.id, providerPayload: { outcome: "success", signature: mockSign(pay.providerPaymentId!, "success") } });
      return { ...res, order: { ...res.order, id: res.order.id } };
    }
    return res;
  };

  const o1 = await place(aarav!, addrA.id, [{ slug: "nimbus-nova-5-pro", qty: 1, color: "Space Black" }, { slug: "aurora-buds-air-2", qty: 1 }], ["WELCOME10"], "ONLINE");
  const o2 = await place(meera!, addrM.id, [{ slug: "aurora-studio-anc-headphones", qty: 1 }, { slug: "voltix-aero-14-ultrabook", qty: 1 }], undefined, "ONLINE");
  const o3 = await place(rohan!, addrR.id, [{ slug: "horizon-vision-27-qhd-240hz-gaming-monitor", qty: 1 }, { slug: "quantum-strike-mechanical-gaming-keyboard", qty: 1 }]);
  const o4 = await place(aarav!, addrA.id, [{ slug: "hyperdrive-gen4-2tb-nvme-ssd", qty: 1 }, { slug: "hyperdrive-140w-gan-fast-charger", qty: 1 }]);
  const o5 = await place(meera!, addrM.id, [{ slug: "kora-pulse-smartwatch", qty: 1 }]);

  const advance = async (orderId: string, steps: Array<"CONFIRMED" | "PROCESSING" | "PACKED" | "SHIPPED" | "OUT_FOR_DELIVERY" | "DELIVERED">) => {
    for (const s of steps) await transitionOrder(actor, orderId, s, s === "SHIPPED" ? { location: "Mumbai Fulfilment Centre" } : {});
  };
  const full = ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
  await advance(o1.order.id, [...full]);
  await advance(o2.order.id, [...full]);
  await advance(o3.order.id, ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED"]);
  await advance(o4.order.id, ["CONFIRMED", "PROCESSING"]);
  void o5;

  // ── reviews on delivered purchases (verified) + a few unverified ones ──
  const reviewDefs: Array<[(typeof customerRows)[number], string, number, string, string]> = [
    [aarav!, "nimbus-nova-5-pro", 5, "Camera and battery are superb", "Low-light shots are stellar, crisp 120Hz display and 100W charging fills the battery in minutes."],
    [aarav!, "aurora-buds-air-2", 4, "Great value ANC", "Noise cancelling is surprisingly good for commute and office. Audio balance is clean."],
    [meera!, "aurora-studio-anc-headphones", 5, "Best headphones for studio and flights", "Plush earcups, zero fatigue after 6 hours, and LDAC audio transmission gives great fidelity."],
    [meera!, "voltix-aero-14-ultrabook", 5, "Feather-light powerhouse", "The 2.8K OLED display is brilliant for design work, and battery easily lasts 15+ hours."],
    [rohan!, "horizon-vision-27-qhd-240hz-gaming-monitor", 5, "Silky smooth 240Hz refresh rate", "Fast IPS response with no motion blur in competitive esports. Great color gamut too."],
    [zoya_(customerRows), "kora-pulse-smartwatch", 5, "Standout display and battery", "Accurate dual-band GPS on outdoor runs and battery easily crosses 9 days between charges."],
  ];
  for (const [u, slug, rating, title, body] of reviewDefs) {
    const r = await createReview(asUser(u), bySlug.get(slug)!, { rating, title, body });
    await moderateReview(actor, r.id, { approve: true });
  }
  for (const id of productIds) await reindexProduct(db, id);

  log("sample orders: 2 delivered, 1 shipped, 1 processing, 1 placed — plus reviews");
  log("");
  log("DEV LOGINS (development only):");
  log(`  admin      ${adminEmail} / ${adminPw}`);
  log(`  super      superadmin@4dcommerce.dev / ${adminPw}`);
  log(`  customer   aarav@example.com / ${custPw}`);
}

function zoya_(rows: Array<Awaited<ReturnType<typeof db.user.create>>>) {
  return rows[3]!;
}

async function main() {
  await seedRbac();
  await seedShipping();
  await seedSettings();
  await seedDemo();
}

main()
  .then(() => log("done"))
  .catch((e) => {
    console.error("[seed] failed:", e);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
