import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { returnsQuery } from "@/server/validation/admin";
import { adminListReturns } from "@/server/services/returns";

export const GET = route({ permission: "return:manage", query: returnsQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await adminListReturns(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
