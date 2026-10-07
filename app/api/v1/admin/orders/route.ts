import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { adminOrdersQuery } from "@/server/validation/orders";
import { adminListOrders } from "@/server/services/orders";

export const GET = route({ permission: "order:read", query: adminOrdersQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await adminListOrders(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
