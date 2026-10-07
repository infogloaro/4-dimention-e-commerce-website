import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { questionsQuery } from "@/server/validation/admin";
import { adminListQuestions } from "@/server/services/reviews";

export const GET = route({ permission: "review:moderate", query: questionsQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await adminListQuestions(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
