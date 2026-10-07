import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { adminReviewsQuery } from "@/server/validation/admin";
import { adminListReviews } from "@/server/services/reviews";

export const GET = route({ permission: "review:moderate", query: adminReviewsQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await adminListReviews(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
