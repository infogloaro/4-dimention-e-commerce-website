import { db } from "@/server/db/client";
import { ART_KIND_BY_SLUG, normaliseHex } from "@/prisma/product-art";
import { heroSvg, specsPanel, VALID_HEX } from "@/server/art/devices";

/**
 * Catalogue artwork, drawn from the product's own record:
 *   hero.svg           default-variant colour
 *   specs.svg          name + highlights
 *   colour-<hex>.svg   a specific variant colour
 * Unknown products or files get a real 404 so the storefront falls back to its neutral placeholder — never to another
 * product's picture.
 */
const SVG = { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400", "X-Content-Type-Options": "nosniff" };

export async function GET(_req: Request, ctx: RouteContext<"/media/art/[slug]/[file]">) {
  const { slug, file } = await ctx.params;
  const kind = ART_KIND_BY_SLUG[slug];
  const m = /^(hero|specs|colour-([0-9a-f]{6}))\.svg$/.exec(file);
  if (!kind || !m) return new Response("Not found", { status: 404 });

  const product = await db.product.findFirst({
    where: { slug, deletedAt: null },
    select: { name: true, highlights: true, brand: { select: { name: true } }, variants: { where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], select: { options: { select: { value: true, swatch: true, attribute: { select: { key: true } } } } } } },
  });
  if (!product) return new Response("Not found", { status: 404 });

  const colours = product.variants.flatMap((v) => v.options.filter((o) => o.attribute.key === "color").map((o) => ({ name: o.value, hex: normaliseHex(o.swatch) }))).filter((c): c is { name: string; hex: string } => !!c.hex);
  const pick = m[2] ? colours.find((c) => c.hex === m[2]) : colours[0];
  if (m[2] && !pick) return new Response("Not found", { status: 404 }); // only colours the product really has
  const hex = pick?.hex ?? "2b2d2a";
  if (!VALID_HEX.test(hex)) return new Response("Not found", { status: 404 });

  const body = m[1] === "specs" ? specsPanel(kind, `#${hex}`, product.name, product.brand?.name ?? "", product.highlights) : heroSvg(kind, hex, product.name, pick?.name);
  return new Response(body, { headers: SVG });
}
