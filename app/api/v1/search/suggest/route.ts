import { z } from "zod";
import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { suggest } from "@/server/services/catalog/search";

/** Lightweight autocomplete: top products (mini cards), categories, brands, popular queries, did-you-mean. */
export const GET = route({ query: z.object({ q: z.string().trim().min(1).max(100) }), rateLimit: RL.search }, async (ctx) =>
  reply(await suggest(ctx.query.q), { headers: { "Cache-Control": "public, max-age=15, s-maxage=30" } }),
);
