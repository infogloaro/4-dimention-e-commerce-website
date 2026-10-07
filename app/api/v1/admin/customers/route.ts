import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { customersQuery } from "@/server/validation/admin";
import { listCustomers } from "@/server/services/admin-ops";

export const GET = route({ permission: "customer:read", query: customersQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await listCustomers(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
