import { beforeAll, describe, expect, it } from "vitest";
import { call } from "../support/api";
import { bootstrap, makeBrand, makeCategory, makeProduct } from "../support/fixtures";
import { db } from "@/server/db/client";
import { invalidate } from "@/server/core/cache";
import * as products from "@/app/api/v1/products/route";
import * as productDetail from "@/app/api/v1/products/[slug]/route";
import * as categories from "@/app/api/v1/categories/route";
import * as search from "@/app/api/v1/search/route";
import * as suggest from "@/app/api/v1/search/suggest/route";

let audio: Awaited<ReturnType<typeof makeCategory>>;
let phones: Awaited<ReturnType<typeof makeCategory>>;
let sub: Awaited<ReturnType<typeof makeCategory>>;
let nimbus: Awaited<ReturnType<typeof makeBrand>>;
let aurora: Awaited<ReturnType<typeof makeBrand>>;
const slugs: Record<string, string> = {};

beforeAll(async () => {
  await bootstrap();
  audio = await makeCategory("Audio");
  sub = await makeCategory("Earbuds", audio.id);
  phones = await makeCategory("Phones");
  nimbus = await makeBrand("Nimbus");
  aurora = await makeBrand("Aurora");
  const mk = async (key: string, o: Parameters<typeof makeProduct>[0]) => (slugs[key] = (await makeProduct(o)).slug);
  await mk("headphones", { name: "Aurora Studio Headphones", categoryId: audio.id, brandId: aurora.id, price: 1_899_900, compareAtPrice: 2_499_900, stock: 20, tags: ["wireless"] });
  await mk("buds", { name: "Aurora Buds Air", categoryId: sub.id, brandId: aurora.id, price: 799_900, stock: 50 });
  await mk("phone", { name: "Nimbus Nova 5 Pro", categoryId: phones.id, brandId: nimbus.id, price: 7_999_900, compareAtPrice: 8_999_900, stock: 5, variants: [{ sku: "NOVA-BLK-256", stock: 2, options: [{ key: "color", value: "Black" }, { key: "storage", value: "256 GB" }] }, { sku: "NOVA-BLK-512", price: 8_799_900, stock: 0, options: [{ key: "color", value: "Black" }, { key: "storage", value: "512 GB" }] }, { sku: "NOVA-SLV-256", stock: 4, options: [{ key: "color", value: "Silver" }, { key: "storage", value: "256 GB" }] }] });
  await mk("phone-oos", { name: "Nimbus Lite Sold Out", categoryId: phones.id, brandId: nimbus.id, price: 1_799_900, stock: 0 });
  await mk("draft", { name: "Secret Prototype", categoryId: phones.id, price: 100, status: "DRAFT" });
  // many extra items to exercise pagination
  for (let i = 0; i < 12; i++) await makeProduct({ name: `Cable ${String(i).padStart(2, "0")}`, categoryId: audio.id, price: 10_000 + i * 1_000, stock: 9 });
  await db.searchSynonym.create({ data: { term: "phone", synonyms: ["smartphone", "mobile"] } });
  invalidate();
});

describe("product listing", () => {
  it("returns a stable envelope with pagination meta and never exceeds the page-size cap", async () => {
    const res = await call(products.GET, { query: { pageSize: 5, page: 2 } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, meta: { page: 2, pageSize: 5, total: 16, totalPages: 4, hasNextPage: true, hasPreviousPage: true } });
    expect(res.body.data).toHaveLength(5);
    expect((await call(products.GET, { query: { pageSize: 1000 } })).status).toBe(422);
    expect((await call(products.GET, { query: { page: 0 } })).status).toBe(422);
  });

  it("never exposes drafts", async () => {
    const res = await call(products.GET, { query: { pageSize: 100 } });
    expect(res.body.data.some((p: any) => p.name === "Secret Prototype")).toBe(false);
  });

  it("card payload carries what animated product cards need and nothing internal", async () => {
    const res = await call(products.GET, { query: { q: "Studio Headphones" } });
    const card = res.body.data[0];
    expect(card).toMatchObject({ name: "Aurora Studio Headphones", slug: slugs.headphones, brand: { name: "Aurora" }, inStock: true, stockStatus: "IN_STOCK", price: { price: 1_899_900, compareAtPrice: 2_499_900, discountPercent: 24, onSale: true } });
    expect(card.image.url).toMatch(/^(https:|\/)/); // absolute CDN URL or a site-relative path
    expect(card.badges.map((b: any) => b.key)).toContain("sale");
    expect(JSON.stringify(card)).not.toMatch(/costPrice|passwordHash|searchText/);
  });

  it("filters by category including its subcategories", async () => {
    const res = await call(products.GET, { query: { category: audio.slug, pageSize: 100 } });
    const names = res.body.data.map((p: any) => p.name);
    expect(names).toContain("Aurora Studio Headphones");
    expect(names).toContain("Aurora Buds Air"); // lives in the child category
    expect(names).not.toContain("Nimbus Nova 5 Pro");
    expect((await call(products.GET, { query: { category: "does-not-exist" } })).status).toBe(404);
  });

  it("filters by brand, price range, availability and discount", async () => {
    expect((await call(products.GET, { query: { brand: nimbus.slug } })).body.meta.total).toBe(2);
    const priced = await call(products.GET, { query: { minPrice: 500_000, maxPrice: 2_000_000 } });
    expect(priced.body.data.map((p: any) => p.name).sort()).toEqual(["Aurora Buds Air", "Aurora Studio Headphones", "Nimbus Lite Sold Out"]);
    const inStock = await call(products.GET, { query: { brand: nimbus.slug, inStock: "true" } });
    expect(inStock.body.data.map((p: any) => p.name)).toEqual(["Nimbus Nova 5 Pro"]);
    expect((await call(products.GET, { query: { minDiscount: 20 } })).body.data.map((p: any) => p.name)).toEqual(["Aurora Studio Headphones"]);
  });

  it("sorts by price both ways and by newest", async () => {
    const asc = await call(products.GET, { query: { sort: "price_asc", pageSize: 3 } });
    expect(asc.body.data.map((p: any) => p.price.min)).toEqual([...asc.body.data.map((p: any) => p.price.min)].sort((a, b) => a - b));
    expect(asc.body.data[0].name).toBe("Cable 00");
    const desc = await call(products.GET, { query: { sort: "price_desc", pageSize: 1 } });
    expect(desc.body.data[0].name).toBe("Nimbus Nova 5 Pro");
    expect((await call(products.GET, { query: { sort: "hacked" } })).status).toBe(422);
  });

  it("filters by dynamic variant attributes and reports facets", async () => {
    const res = await call(products.GET, { query: { "attr.color": "Silver" } });
    expect(res.body.data.map((p: any) => p.name)).toEqual(["Nimbus Nova 5 Pro"]);
    const facets = (await call(products.GET, { query: { category: phones.slug } })).body.meta.facets;
    expect(facets.brands[0]).toMatchObject({ name: "Nimbus", count: 2 });
    expect(facets.priceRange.min).toBe(1_799_900);
    expect(facets.availability).toEqual({ inStock: 1, outOfStock: 1 });
    const color = facets.attributes.find((a: any) => a.key === "color");
    expect(color.values.map((v: any) => v.value).sort()).toEqual(["Black", "Silver"]);
    expect(color.values.find((v: any) => v.value === "Black").count).toBe(1); // distinct products, not variants
  });

  it("can skip facet computation for lightweight requests", async () => {
    const res = await call(products.GET, { query: { facets: "false", pageSize: 2 } });
    expect(res.body.meta.facets).toBeUndefined();
  });
});

describe("search", () => {
  it("finds by name, brand, SKU and tag", async () => {
    expect((await call(search.GET, { query: { q: "headphones" } })).body.data[0].name).toBe("Aurora Studio Headphones");
    expect((await call(search.GET, { query: { q: "nimbus" } })).body.meta.total).toBe(2);
    expect((await call(search.GET, { query: { q: "NOVA-SLV" } })).body.data[0].name).toBe("Nimbus Nova 5 Pro");
    expect((await call(search.GET, { query: { q: "wireless" } })).body.data[0].name).toBe("Aurora Studio Headphones");
  });

  it("tolerates typos and expands synonyms", async () => {
    expect((await call(search.GET, { query: { q: "headfones" } })).body.data.map((p: any) => p.name)).toContain("Aurora Studio Headphones");
    expect((await call(search.GET, { query: { q: "smartphone" } })).body.data.map((p: any) => p.name)).toContain("Nimbus Nova 5 Pro");
  });

  it("requires a query and returns a recovery payload (never a dead end) when nothing matches", async () => {
    expect((await call(search.GET)).status).toBe(422);
    const none = await call(search.GET, { query: { q: "zzzzqqqq" } });
    expect(none.body.data).toEqual([]);
    expect(none.body.meta.total).toBe(0);
    expect(none.body.meta.emptyState.popularProducts.length).toBeGreaterThan(0);
  });

  it("treats LIKE wildcards and SQL as plain text", async () => {
    for (const q of ["%", "_", "'; DROP TABLE \"Product\"; --", "\\"]) expect((await call(search.GET, { query: { q } })).status).toBe(200);
    expect(await db.product.count()).toBeGreaterThan(10);
  });

  it("returns lightweight autocomplete groups", async () => {
    const res = await call(suggest.GET, { query: { q: "aur" } });
    expect(res.status).toBe(200);
    expect(res.body.data.brands.map((b: any) => b.name)).toContain("Aurora");
    expect(res.body.data.products.length).toBeGreaterThan(0);
    expect(Object.keys(res.body.data.products[0]).sort()).toEqual(["brand", "compareAtPrice", "id", "image", "inStock", "name", "price", "slug"]);
    const typo = await call(suggest.GET, { query: { q: "headfones" } });
    expect(typo.body.data.products.length).toBeGreaterThan(0);
  });
});

describe("product detail", () => {
  it("exposes option axes with per-value availability and disables (not drops) sold-out variants", async () => {
    const res = await call(productDetail.GET, { params: { slug: slugs.phone! } });
    expect(res.status).toBe(200);
    const p = res.body.data;
    expect(p.options.map((o: any) => o.key).sort()).toEqual(["color", "storage"]);
    const storage = p.options.find((o: any) => o.key === "storage").values;
    expect(storage.find((v: any) => v.value === "512 GB")).toMatchObject({ available: false });
    expect(storage.find((v: any) => v.value === "256 GB")).toMatchObject({ available: true });
    const v512 = p.variants.find((v: any) => v.sku === "NOVA-BLK-512");
    expect(v512.availability).toMatchObject({ status: "OUT_OF_STOCK", inStock: false, maxPurchasable: 0 });
    const low = p.variants.find((v: any) => v.sku === "NOVA-BLK-256");
    expect(low.availability).toMatchObject({ status: "LOW_STOCK", available: 2, lowStock: true });
    expect(p.price).toMatchObject({ from: true, min: 7_999_900, max: 8_799_900 });
    expect(p.variants.find((v: any) => v.isDefault)).toBeTruthy();
  });

  it("includes SEO, structured data, media, breadcrumbs and rating summary", async () => {
    const p = (await call(productDetail.GET, { params: { slug: slugs.buds! } })).body.data;
    expect(p.seo.canonicalUrl).toContain(`/product/${slugs.buds}`);
    expect(p.structuredData).toMatchObject({ "@type": "Product", offers: { priceCurrency: "INR" } });
    expect(p.media[0]).toMatchObject({ isPrimary: true });
    expect(p.breadcrumbs.map((b: any) => b.name)).toEqual(["Audio", "Earbuds"]);
    expect(p.rating).toMatchObject({ average: 0, count: 0 });
    expect(JSON.stringify(p)).not.toMatch(/costPrice|searchText/);
  });

  it("returns a typed 404 for unknown or draft products", async () => {
    const missing = await call(productDetail.GET, { params: { slug: "nope" } });
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ success: false, error: { code: "PRODUCT_NOT_FOUND" } });
    expect((await call(productDetail.GET, { params: { slug: slugs.draft! } })).status).toBe(404);
  });
});

describe("categories", () => {
  it("serves the whole tree in one call with rolled-up counts", async () => {
    const res = await call(categories.GET);
    const a = res.body.data.find((c: any) => c.slug === audio.slug);
    expect(a.children.map((c: any) => c.name)).toEqual(["Earbuds"]);
    expect(a.productCount).toBe(14); // headphones + 12 cables + buds in child
    expect(a.children[0].productCount).toBe(1);
    expect(res.headers.get("cache-control")).toMatch(/s-maxage/);
  });
});
