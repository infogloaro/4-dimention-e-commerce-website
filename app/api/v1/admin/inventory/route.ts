import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { inventoryQuery } from "@/server/validation/admin";
import { listInventory } from "@/server/services/admin-inventory";

export const GET = route({ permission: "inventory:read", query: inventoryQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await listInventory(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
