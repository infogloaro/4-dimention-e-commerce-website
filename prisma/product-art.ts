/**
 * Authoritative product → artwork association.
 *
 * Every catalogue product is mapped to its device kind by SLUG (never by array index or file order), and every
 * image URL is derived from that slug, so a product can only ever point at its own artwork:
 *
 *   /media/art/<slug>/hero.svg          product-level primary image (default variant colour)
 *   /media/art/<slug>/specs.svg         product-level second image (name + highlights)
 *   /media/art/<slug>/colour-<hex>.svg  variant-level image, linked to the variants whose colour swatch is <hex>
 *
 * Drawn on request by `app/media/art/[slug]/[file]/route.ts` from the product's OWN slug → device kind and the colour
 * stored on its variants, so artwork can never drift from the catalogue. Category tiles and neutral placeholders are
 * static files written by `scripts/generate-product-art.ts`. The products are fictional, so these are illustrations of
 * the right *type* of device in the right colour — not photographs; real uploads simply replace the URLs.
 */
export type ArtKind =
  | "phone" | "tablet" | "laptop" | "headphones" | "earbuds" | "speaker" | "smartwatch" | "band"
  | "monitor" | "cpu" | "gpu" | "ssd" | "keyboard" | "mouse" | "router" | "charger";

export const ART_KIND_BY_SLUG: Record<string, ArtKind> = {
  "nimbus-nova-5-pro": "phone",
  "nimbus-nova-5": "phone",
  "nimbus-lite-3": "phone",
  "nimbus-tab-11-ultra": "tablet",
  "voltix-aero-14-ultrabook": "laptop",
  "voltix-forge-16-creator": "laptop",
  "voltix-go-15-everyday-laptop": "laptop",
  "aurora-studio-anc-headphones": "headphones",
  "aurora-buds-air-2": "earbuds",
  "aurora-boom-portable-speaker": "speaker",
  "kora-pulse-smartwatch": "smartwatch",
  "kora-band-4": "band",
  "horizon-vision-27-qhd-240hz-gaming-monitor": "monitor",
  "horizon-ultra-32-4k-oled-pro-display": "monitor",
  "apex-core-x9-desktop-processor": "cpu",
  "apex-phantom-rtx-4080-graphics-card": "gpu",
  "hyperdrive-gen4-2tb-nvme-ssd": "ssd",
  "quantum-strike-mechanical-gaming-keyboard": "keyboard",
  "quantum-swift-wireless-gaming-mouse": "mouse",
  "netpulse-tri-band-wi-fi-7-mesh-router": "router",
  "hyperdrive-140w-gan-fast-charger": "charger",
};

/** Representative device for a category tile and for the category-level fallback image. */
export const CATEGORY_KIND: Record<string, ArtKind> = {
  electronics: "laptop",
  smartphones: "phone",
  tablets: "tablet",
  laptops: "laptop",
  "gaming-laptops": "laptop",
  audio: "headphones",
  wearables: "smartwatch",
  monitors: "monitor",
  components: "gpu",
  "gaming-gear": "keyboard",
  cameras: "monitor",
  networking: "router",
};

/** `#C9CCD1` / `c9ccd1` → `c9ccd1`, or null when it is not a 6-digit hex colour. */
export const normaliseHex = (v: string | null | undefined) => { const m = /^#?([0-9a-f]{6})$/i.exec((v ?? "").trim()); return m ? m[1]!.toLowerCase() : null; };

export const productArtUrl = (slug: string, file: "hero" | "specs" | `colour-${string}`) => `/media/art/${slug}/${file}.svg`;
export const categoryArtUrl = (slug: string) => `/catalog/categories/${slug}.svg`;
export const placeholderUrl = (kindOrCategory?: string | null) => `/catalog/placeholders/${kindOrCategory && (kindOrCategory in CATEGORY_KIND || kindOrCategory in KINDS_SET) ? kindOrCategory : "product"}.svg`;

const KINDS_SET: Record<ArtKind, true> = {
  phone: true, tablet: true, laptop: true, headphones: true, earbuds: true, speaker: true, smartwatch: true, band: true,
  monitor: true, cpu: true, gpu: true, ssd: true, keyboard: true, mouse: true, router: true, charger: true,
};
export const ART_KINDS = Object.keys(KINDS_SET) as ArtKind[];

/** Product-level media rows (variantId = null) for `createProduct`. Throws for an unmapped slug so nothing is guessed. */
export function productMediaFor(slug: string, name: string) {
  if (!ART_KIND_BY_SLUG[slug]) throw new Error(`No artwork mapping for product "${slug}". Add it to ART_KIND_BY_SLUG.`);
  return [
    { type: "IMAGE" as const, url: productArtUrl(slug, "hero"), thumbnailUrl: productArtUrl(slug, "hero"), alt: `${name} — product illustration`, width: 1000, height: 1000, isPrimary: true, sortOrder: 0 },
    { type: "IMAGE" as const, url: productArtUrl(slug, "specs"), thumbnailUrl: productArtUrl(slug, "specs"), alt: `${name} — key features`, width: 1000, height: 1000, isPrimary: false, sortOrder: 1 },
  ];
}
