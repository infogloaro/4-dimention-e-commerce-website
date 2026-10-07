import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { ticketsQuery } from "@/server/validation/admin";
import { adminListTickets } from "@/server/services/support";

export const GET = route({ permission: "support:read", query: ticketsQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await adminListTickets(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
