# Product image audit

_Generated 2026-10-09T11:42:14.790Z by `scripts/audit-product-images.ts` against the live database._

## Root causes
1. **Random photos.** `prisma/seed.ts` and `scripts/curate-electronics-catalog.ts` stored `https://picsum.photos/seed/<slug>-N/...` for every product. That service returns an arbitrary photograph per seed string, so a laptop could show a landscape and a keyboard a face: the URL was derived from the slug but was never related to the product.
2. **Two catalogues.** The storefront ignored the backend and rendered a different catalogue from `dummyjson.com` (its own images, USD prices, a demo-only checkout). Cart, checkout and order data never matched the product the shopper clicked.
3. **Hard-coded fallbacks.** Category tiles and the hero used hand-picked Unsplash IDs and there was no neutral fallback, so a missing image showed a broken icon.
4. **Order snapshots inherited the bad data.** `OrderItem.imageUrl` was copied from the wrong media when the order was placed.
5. **Seed drift.** The dev database's colours/categories no longer matched `seed-data.ts`, so files keyed to seed colour names would have 404'd. Variant artwork is therefore drawn from the **database's own swatch hex**.

## What changed
- `prisma/product-art.ts`: explicit slug-to-device map (no index/order assignment) and URL helpers; `productMediaFor()` throws for an unmapped slug instead of guessing.
- `app/media/art/[slug]/[file]/route.ts` (+ `server/art/devices.ts`): draws the product / colour-variant image from the product's own record; unknown product, unknown file or a colour the product does not have returns a real 404.
- `prisma/apply-product-art.ts` / `scripts/apply-product-images.ts`: idempotent data correction (products, variant images, categories, brands, collections, CMS blocks, order-item snapshots). Seed and curation scripts now call it.
- Storefront: a single `SafeImg` / `ProductImage` component. Missing or failing image: neutral category placeholder ("Image coming soon"); failing placeholder: inline icon; no retry loop; fixed aspect ratio and intrinsic size (no layout shift).
- Legacy archived non-electronics products: their random photos were removed (historical order lines show the neutral placeholder).

## Honest limitation
The catalogue products are fictional brands, so no real photograph of them exists. The images are **illustrations of the correct type of device in the correct colour**, not photographs, and the product page says so. Upload real photography through the admin media tools to replace them.

## Result (after)
- Products checked: **21**, with problems: **0**
- Active categories with a missing tile image: none
- Order-item snapshots still pointing at random photos: **0**; with no image (archived legacy products, shown as placeholder): 4

| Product | SKUs | Image before | Issue detected | Image after | Verification |
|---|---|---|---|---|---|
| apex-core-x9-desktop-processor | ACXDP-STD | `https://picsum.photos/seed/apex-core-x9-desktop-processor-1/1000/1000` | random stock photo unrelated to the product | `/media/art/apex-core-x9-desktop-processor/hero.svg` (+1 more) | OK: slug-scoped URLs, kind `cpu`, 1 variants |
| apex-phantom-rtx-4080-graphics-card | APR4GC-STD | `https://picsum.photos/seed/apex-phantom-rtx-4080-graphics-card-1/1000/1000` | random stock photo unrelated to the product | `/media/art/apex-phantom-rtx-4080-graphics-card/hero.svg` (+1 more) | OK: slug-scoped URLs, kind `gpu`, 1 variants |
| aurora-boom-portable-speaker | ABPS-CRIMSON, ABPS-OCEAN-BLUE, ABPS-MIDNIGHT-BLACK | `https://picsum.photos/seed/aurora-boom-portable-speaker-1/1000/1000` | random stock photo unrelated to the product | `/media/art/aurora-boom-portable-speaker/hero.svg` (+4 more) | OK: slug-scoped URLs, kind `speaker`, 3 variants |
| aurora-buds-air-2 | ABA2-PEARL-WHITE, ABA2-MIDNIGHT-BLACK, ABA2-FOREST-GREEN | `https://picsum.photos/seed/aurora-buds-air-2-1/1000/1000` | random stock photo unrelated to the product | `/media/art/aurora-buds-air-2/hero.svg` (+4 more) | OK: slug-scoped URLs, kind `earbuds`, 3 variants |
| aurora-studio-anc-headphones | ASAH-MIDNIGHT-BLACK, ASAH-DESERT-SAND, ASAH-NAVY | `https://picsum.photos/seed/aurora-studio-anc-headphones-1/1000/1000` | random stock photo unrelated to the product | `/media/art/aurora-studio-anc-headphones/hero.svg` (+4 more) | OK: slug-scoped URLs, kind `headphones`, 3 variants |
| horizon-ultra-32-4k-oled-pro-display | HU34OPD-SPACE-BLACK, HU34OPD-TITANIUM-SILVER | `https://picsum.photos/seed/horizon-ultra-32-4k-oled-pro-display-1/1000/1000` | random stock photo unrelated to the product | `/media/art/horizon-ultra-32-4k-oled-pro-display/hero.svg` (+3 more) | OK: slug-scoped URLs, kind `monitor`, 2 variants |
| horizon-vision-27-qhd-240hz-gaming-monitor | HV2Q2GM-SPACE-BLACK | `https://picsum.photos/seed/horizon-vision-27-qhd-240hz-gaming-monitor-1/1000/1000` | random stock photo unrelated to the product | `/media/art/horizon-vision-27-qhd-240hz-gaming-monitor/hero.svg` (+2 more) | OK: slug-scoped URLs, kind `monitor`, 1 variants |
| hyperdrive-140w-gan-fast-charger | H1GFC-SPACE-BLACK, H1GFC-GLACIER-WHITE | `https://picsum.photos/seed/hyperdrive-140w-gan-fast-charger-1/1000/1000` | random stock photo unrelated to the product | `/media/art/hyperdrive-140w-gan-fast-charger/hero.svg` (+3 more) | OK: slug-scoped URLs, kind `charger`, 2 variants |
| hyperdrive-gen4-2tb-nvme-ssd | HG2NS-1-TB, HG2NS-2-TB, HG2NS-4-TB | `https://picsum.photos/seed/hyperdrive-gen4-2tb-nvme-ssd-1/1000/1000` | random stock photo unrelated to the product | `/media/art/hyperdrive-gen4-2tb-nvme-ssd/hero.svg` (+1 more) | OK: slug-scoped URLs, kind `ssd`, 3 variants |
| kora-band-4 | KB4-MIDNIGHT-BLACK, KB4-CRIMSON, KB4-OCEAN-BLUE | `https://picsum.photos/seed/kora-band-4-1/1000/1000` | random stock photo unrelated to the product | `/media/art/kora-band-4/hero.svg` (+4 more) | OK: slug-scoped URLs, kind `band`, 3 variants |
| kora-pulse-smartwatch | KPS-MIDNIGHT-BLACK-42, KPS-MIDNIGHT-BLACK-46, KPS-SILVER-42-MM, KPS-SILVER-46-MM, KPS-OLIVE-42-MM, KPS-OLIVE-46-MM | `https://picsum.photos/seed/kora-pulse-smartwatch-1/1000/1000` | random stock photo unrelated to the product | `/media/art/kora-pulse-smartwatch/hero.svg` (+7 more) | OK: slug-scoped URLs, kind `smartwatch`, 6 variants |
| netpulse-tri-band-wi-fi-7-mesh-router | NTBWF7MR-STD | `https://picsum.photos/seed/netpulse-tri-band-wi-fi-7-mesh-router-1/1000/1000` | random stock photo unrelated to the product | `/media/art/netpulse-tri-band-wi-fi-7-mesh-router/hero.svg` (+1 more) | OK: slug-scoped URLs, kind `router`, 1 variants |
| nimbus-lite-3 | NL3-OCEAN-BLUE-128-GB, NL3-MIDNIGHT-BLACK-128 | `https://picsum.photos/seed/nimbus-lite-3-1/1000/1000` | random stock photo unrelated to the product | `/media/art/nimbus-lite-3/hero.svg` (+3 more) | OK: slug-scoped URLs, kind `phone`, 2 variants |
| nimbus-nova-5 | NN5-MIDNIGHT-BLACK-128, NN5-MIDNIGHT-BLACK-256, NN5-FOREST-GREEN-128-G, NN5-FOREST-GREEN-256-G, NN5-PEARL-WHITE-128-GB, NN5-PEARL-WHITE-256-GB | `https://picsum.photos/seed/nimbus-nova-5-1/1000/1000` | random stock photo unrelated to the product | `/media/art/nimbus-nova-5/hero.svg` (+7 more) | OK: slug-scoped URLs, kind `phone`, 6 variants |
| nimbus-nova-5-pro | NN5P-MIDNIGHT-BLACK-256, NN5P-MIDNIGHT-BLACK-512, NN5P-SILVER-256-GB-12-G, NN5P-SILVER-512-GB-12-G, NN5P-OCEAN-BLUE-256-GB, NN5P-OCEAN-BLUE-512-GB | `https://picsum.photos/seed/nimbus-nova-5-pro-1/1000/1000` | random stock photo unrelated to the product | `/media/art/nimbus-nova-5-pro/hero.svg` (+7 more) | OK: slug-scoped URLs, kind `phone`, 6 variants |
| nimbus-tab-11-ultra | NT1U-TITANIUM-SILVER-12, NT1U-TITANIUM-SILVER-25, NT1U-GRAPHITE-GREY-128, NT1U-GRAPHITE-GREY-256 | `https://picsum.photos/seed/nimbus-tab-11-ultra-1/1000/1000` | random stock photo unrelated to the product | `/media/art/nimbus-tab-11-ultra/hero.svg` (+5 more) | OK: slug-scoped URLs, kind `tablet`, 4 variants |
| quantum-strike-mechanical-gaming-keyboard | QSMGK-SPACE-BLACK, QSMGK-GLACIER-WHITE | `https://picsum.photos/seed/quantum-strike-mechanical-gaming-keyboard-1/1000/1000` | random stock photo unrelated to the product | `/media/art/quantum-strike-mechanical-gaming-keyboard/hero.svg` (+3 more) | OK: slug-scoped URLs, kind `keyboard`, 2 variants |
| quantum-swift-wireless-gaming-mouse | QSWGM-SPACE-BLACK, QSWGM-GLACIER-WHITE | `https://picsum.photos/seed/quantum-swift-wireless-gaming-mouse-1/1000/1000` | random stock photo unrelated to the product | `/media/art/quantum-swift-wireless-gaming-mouse/hero.svg` (+3 more) | OK: slug-scoped URLs, kind `mouse`, 2 variants |
| voltix-aero-14-ultrabook | VA1U-SLATE-GREY-512-GB, VA1U-SLATE-GREY-512-GBX, VA1U-SLATE-GREY-1-TB-16, VA1U-SLATE-GREY-1-TB-32, VA1U-SILVER-512-GB-16-G, VA1U-SILVER-512-GB-32-G, VA1U-SILVER-1-TB-16-GB, VA1U-SILVER-1-TB-32-GB | `https://picsum.photos/seed/voltix-aero-14-ultrabook-1/1000/1000` | random stock photo unrelated to the product | `/media/art/voltix-aero-14-ultrabook/hero.svg` (+9 more) | OK: slug-scoped URLs, kind `laptop`, 8 variants |
| voltix-forge-16-creator | VF1C-MIDNIGHT-BLACK-1-T, VF1C-MIDNIGHT-BLACK-1-TX, VF1C-MIDNIGHT-BLACK-2-T, VF1C-MIDNIGHT-BLACK-2-TX | `https://picsum.photos/seed/voltix-forge-16-creator-1/1000/1000` | random stock photo unrelated to the product | `/media/art/voltix-forge-16-creator/hero.svg` (+5 more) | OK: slug-scoped URLs, kind `laptop`, 4 variants |
| voltix-go-15-everyday-laptop | VG1EL-SILVER-8-GB, VG1EL-SILVER-16-GB, VG1EL-SLATE-GREY-8-GB, VG1EL-SLATE-GREY-16-GB | `https://picsum.photos/seed/voltix-go-15-everyday-laptop-1/1000/1000` | random stock photo unrelated to the product | `/media/art/voltix-go-15-everyday-laptop/hero.svg` (+5 more) | OK: slug-scoped URLs, kind `laptop`, 4 variants |

## Needs manual confirmation
- No catalogue image is an external URL.
- Artistic correctness was reviewed by eye for all 21 hero renders and a sample of colour/specs renders. The automated checks above verify *association* (slug, colour, device kind, file existence), not artwork quality.
- The home-page hero and "story" photos (Unsplash) were opened and confirmed to show a laptop and electronics circuitry respectively; they are lifestyle images, not product listings.
