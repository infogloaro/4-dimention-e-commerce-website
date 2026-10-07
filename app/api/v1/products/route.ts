import { route, reply, publicCache } from "@/server/core/http";
import { listingQuery } from "@/server/validation/catalog";
import { listProducts } from "@/server/services/catalog/listing";

export const GET = route({ query: listingQuery, auth: "optional" }, async (ctx) => {
  const res = await listProducts(ctx.query, { userId: ctx.user?.id });
  return reply(res.items, { meta: { ...res.meta, facets: res.facets, emptyState: res.emptyState }, headers: ctx.query.q ? undefined : publicCache(30, 120) });
});
