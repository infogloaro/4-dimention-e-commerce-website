/**
 * Writes the STATIC catalogue artwork (category tiles + neutral placeholders) to public/catalog.
 *   npx tsx scripts/generate-product-art.ts
 * Product and variant artwork is drawn on request by app/media/art/[slug]/[file]/route.ts.
 * Deterministic and idempotent: running it twice yields byte-identical files.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ART_KINDS, CATEGORY_KIND } from "../prisma/product-art";
import { categorySvg, placeholderSvg } from "../server/art/devices";

const OUT = join(process.cwd(), "public", "catalog");
const write = (rel: string, content: string) => {
  const file = join(OUT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
};

rmSync(join(OUT, "products"), { recursive: true, force: true }); // superseded by the /media/art route
for (const slug of Object.keys(CATEGORY_KIND)) write(`categories/${slug}.svg`, categorySvg(slug)!);
for (const name of [...ART_KINDS, ...Object.keys(CATEGORY_KIND), "product"]) write(`placeholders/${name}.svg`, placeholderSvg(name));
console.log(`[art] wrote ${Object.keys(CATEGORY_KIND).length} category tiles and ${ART_KINDS.length + Object.keys(CATEGORY_KIND).length + 1} placeholders to public/catalog`);
