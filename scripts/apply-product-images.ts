/**
 * Corrects product / category imagery at its source (the database).
 *   npx tsx scripts/generate-product-art.ts   # once, writes public/catalog/**
 *   npx tsx scripts/apply-product-images.ts   # idempotent
 *
 * Root cause being fixed: seed + curation scripts stored `https://picsum.photos/seed/<slug>-N/…` for every product. That
 * service returns an arbitrary photograph per seed string, so a laptop could show a landscape and a keyboard a stranger's
 * face. Here every product's media is derived from its own slug via prisma/product-art.ts (explicit slug → device kind),
 * variant colour images are attached to exactly the variants of that colour, and picsum URLs are removed everywhere.
 *
 * Existing OrderItem.imageUrl *snapshots* that still point at picsum are repaired too — they were captured from the wrong
 * data. Snapshots that point anywhere else are never touched (an order keeps the image of what was bought).
 */
import "dotenv/config";
import { db, disconnectDb } from "../server/db/client";
import { applyProductArt } from "../prisma/apply-product-art";

applyProductArt(db)
  .then((summary) => console.log(JSON.stringify(summary, null, 2)))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => disconnectDb());
