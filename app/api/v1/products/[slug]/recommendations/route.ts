import { z } from "zod";
import { route, reply, publicCache } from "@/server/core/http";
import { slugParams } from "@/server/validation/common";
import { frequentlyBoughtTogether, productIdBySlug, related, similar } from "@/server/services/recommendations";

const query = z.object({ limit: z.coerce.number().int().min(1).max(20).default(10) });

/** Grouped recommendations for the PDP: one request instead of three. */
export const GET = route({ params: slugParams, query }, async (ctx) => {
  const id = await productIdBySlug(ctx.params.slug);
  const [relatedItems, similarItems, together] = await Promise.all([related(id, ctx.query.limit), similar(id, ctx.query.limit), frequentlyBoughtTogether(id, 4)]);
  return reply({ related: relatedItems, similar: similarItems, frequentlyBoughtTogether: together }, { headers: publicCache(60, 300) });
});
