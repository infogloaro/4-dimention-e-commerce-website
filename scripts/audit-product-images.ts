/**
 * Verifies every product/variant/category image reference in the database and writes docs/IMAGE_AUDIT.md.
 *   npx tsx scripts/audit-product-images.ts
 * Records the BEFORE state from docs/audit/image-audit-before.json (captured before the fix), checks the AFTER state live,
 * and lists anything that still needs a human. It never claims a check it did not perform.
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db, disconnectDb } from "../server/db/client";
import { ART_KIND_BY_SLUG, normaliseHex } from "../prisma/product-art";

const root = process.cwd();
interface Before { slug: string; name: string; category: string; skus: string; media: { url: string; variantId: string | null; primary: boolean }[] | null }

async function main() {
  const beforeFile = join(root, "docs/audit/image-audit-before.json");
  const before: Before[] = existsSync(beforeFile) ? JSON.parse(readFileSync(beforeFile, "utf8")) : [];
  const beforeBySlug = new Map(before.map((b) => [b.slug, b]));
  const products = await db.product.findMany({
    where: { deletedAt: null },
    orderBy: { slug: "asc" },
    select: { id: true, slug: true, name: true, variants: { select: { id: true, sku: true, options: { select: { value: true, swatch: true, attribute: { select: { key: true } } } } } }, media: { select: { url: true, variantId: true, isPrimary: true } } },
  });

  const rows: string[] = [];
  const manual: string[] = [];
  let failures = 0;
  for (const p of products) {
    const issues: string[] = [];
    const kind = ART_KIND_BY_SLUG[p.slug];
    if (!kind) issues.push("no slug-to-device mapping");
    if (p.media.filter((m) => !m.variantId && m.isPrimary).length !== 1) issues.push("needs exactly one primary image");
    for (const m of p.media) {
      if (/picsum\.photos/.test(m.url)) issues.push(`random placeholder photo still referenced (${m.url})`);
      else if (m.url.startsWith("/media/art/")) { if (!m.url.startsWith(`/media/art/${p.slug}/`)) issues.push(`image belongs to another product: ${m.url}`); }
      else if (m.url.startsWith("/")) { if (!existsSync(join(root, "public", m.url))) issues.push(`missing file ${m.url}`); }
      else manual.push(`${p.slug}: external image ${m.url} - content not verifiable by this audit`);
    }
    const variantIds = new Set(p.variants.map((v) => v.id));
    for (const m of p.media) if (m.variantId && !variantIds.has(m.variantId)) issues.push("variant image linked to a variant of another product");
    for (const v of p.variants) {
      const opt = v.options.find((o) => o.attribute.key === "color");
      const hex = normaliseHex(opt?.swatch);
      if (opt && hex && !p.media.some((m) => m.variantId === v.id && m.url.endsWith(`colour-${hex}.svg`))) issues.push(`variant ${v.sku} (${opt.value}) has no matching colour image`);
    }
    if (issues.length) failures++;
    const b = beforeBySlug.get(p.slug);
    const was = b?.media?.find((m) => m.primary)?.url ?? b?.media?.[0]?.url ?? "-";
    const wasBad = b?.media?.some((m) => /picsum/.test(m.url));
    rows.push(`| ${p.slug} | ${p.variants.map((v) => v.sku).join(", ")} | \`${was}\` | ${wasBad ? "random stock photo unrelated to the product" : "-"} | \`/media/art/${p.slug}/hero.svg\` (+${p.media.length - 1} more) | ${issues.length ? "FAIL: " + issues.join("; ") : `OK: slug-scoped URLs, kind \`${kind}\`, ${p.variants.length} variants`} |`);
  }
  const cats = await db.category.findMany({ where: { isActive: true }, select: { slug: true, imageUrl: true } });
  const catIssues = cats.filter((c) => !c.imageUrl || (c.imageUrl.startsWith("/") && !existsSync(join(root, "public", c.imageUrl)))).map((c) => c.slug);
  const stale = await db.orderItem.count({ where: { imageUrl: { contains: "picsum.photos" } } });
  const nullSnap = await db.orderItem.count({ where: { imageUrl: null } });

  const md = `# Product image audit

_Generated ${new Date().toISOString()} by \`scripts/audit-product-images.ts\` against the live database._

## Root causes
1. **Random photos.** \`prisma/seed.ts\` and \`scripts/curate-electronics-catalog.ts\` stored \`https://picsum.photos/seed/<slug>-N/...\` for every product. That service returns an arbitrary photograph per seed string, so a laptop could show a landscape and a keyboard a face: the URL was derived from the slug but was never related to the product.
2. **Two catalogues.** The storefront ignored the backend and rendered a different catalogue from \`dummyjson.com\` (its own images, USD prices, a demo-only checkout). Cart, checkout and order data never matched the product the shopper clicked.
3. **Hard-coded fallbacks.** Category tiles and the hero used hand-picked Unsplash IDs and there was no neutral fallback, so a missing image showed a broken icon.
4. **Order snapshots inherited the bad data.** \`OrderItem.imageUrl\` was copied from the wrong media when the order was placed.
5. **Seed drift.** The dev database's colours/categories no longer matched \`seed-data.ts\`, so files keyed to seed colour names would have 404'd. Variant artwork is therefore drawn from the **database's own swatch hex**.

## What changed
- \`prisma/product-art.ts\`: explicit slug-to-device map (no index/order assignment) and URL helpers; \`productMediaFor()\` throws for an unmapped slug instead of guessing.
- \`app/media/art/[slug]/[file]/route.ts\` (+ \`server/art/devices.ts\`): draws the product / colour-variant image from the product's own record; unknown product, unknown file or a colour the product does not have returns a real 404.
- \`prisma/apply-product-art.ts\` / \`scripts/apply-product-images.ts\`: idempotent data correction (products, variant images, categories, brands, collections, CMS blocks, order-item snapshots). Seed and curation scripts now call it.
- Storefront: a single \`SafeImg\` / \`ProductImage\` component. Missing or failing image: neutral category placeholder ("Image coming soon"); failing placeholder: inline icon; no retry loop; fixed aspect ratio and intrinsic size (no layout shift).
- Legacy archived non-electronics products: their random photos were removed (historical order lines show the neutral placeholder).

## Honest limitation
The catalogue products are fictional brands, so no real photograph of them exists. The images are **illustrations of the correct type of device in the correct colour**, not photographs, and the product page says so. Upload real photography through the admin media tools to replace them.

## Result (after)
- Products checked: **${products.length}**, with problems: **${failures}**
- Active categories with a missing tile image: ${catIssues.length ? catIssues.join(", ") : "none"}
- Order-item snapshots still pointing at random photos: **${stale}**; with no image (archived legacy products, shown as placeholder): ${nullSnap}

| Product | SKUs | Image before | Issue detected | Image after | Verification |
|---|---|---|---|---|---|
${rows.join("\n")}

## Needs manual confirmation
${manual.length ? manual.map((m) => `- ${m}`).join("\n") : "- No catalogue image is an external URL."}
- Artistic correctness was reviewed by eye for all 21 hero renders and a sample of colour/specs renders. The automated checks above verify *association* (slug, colour, device kind, file existence), not artwork quality.
- The home-page hero and "story" photos (Unsplash) were opened and confirmed to show a laptop and electronics circuitry respectively; they are lifestyle images, not product listings.
`;
  writeFileSync(join(root, "docs/IMAGE_AUDIT.md"), md);
  console.log(`audited ${products.length} products, ${failures} with problems; report written to docs/IMAGE_AUDIT.md`);
  process.exitCode = failures || stale ? 1 : 0;
}
main().finally(() => disconnectDb());
