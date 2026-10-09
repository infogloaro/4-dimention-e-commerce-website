import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { adminListRefunds, adminRefundsQuery } from "@/server/services/admin-finance";

/** Refund records across all orders (pending offline refunds, provider failures, completed). */
export const GET = route({ permission: ["order:refund", "order:read"], permissionMode: "any", query: adminRefundsQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await adminListRefunds(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
