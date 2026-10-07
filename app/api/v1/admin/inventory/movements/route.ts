import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { movementsQuery } from "@/server/validation/admin";
import { listMovements } from "@/server/services/admin-inventory";

export const GET = route({ permission: "inventory:read", query: movementsQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await listMovements(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
