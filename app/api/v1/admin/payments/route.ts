import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { adminListPayments, adminPaymentsQuery } from "@/server/services/admin-finance";

/** Payment attempts across all orders. Provider secrets, client payloads and card data are never returned. */
export const GET = route({ permission: "order:read", query: adminPaymentsQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await adminListPayments(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
