import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { rangeQuery } from "@/server/validation/admin";
import { categoryPerformance, topProducts } from "@/server/services/analytics";

/** Top products and category performance for the range. */
export const GET = route({ permission: "analytics:read", query: rangeQuery, rateLimit: RL.admin }, async (ctx) => {
  const [products, categories] = await Promise.all([topProducts(ctx.query), categoryPerformance(ctx.query)]);
  return { topProducts: products, categories };
});
