import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { AppError } from "@/server/core/errors";
import { listingQuery } from "@/server/validation/catalog";
import { listProducts } from "@/server/services/catalog/listing";

export const GET = route({ query: listingQuery, auth: "optional", rateLimit: RL.search }, async (ctx) => {
  if (!ctx.query.q) throw new AppError("VALIDATION_ERROR", "Request validation failed", { fields: [{ path: "q", code: "required", message: "q is required" }] });
  const res = await listProducts(ctx.query, { userId: ctx.user?.id });
  return reply(res.items, { meta: { ...res.meta, facets: res.facets, emptyState: res.emptyState } });
});
