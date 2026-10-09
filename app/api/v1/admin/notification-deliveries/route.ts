import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { adminDeliveriesQuery, adminListDeliveries } from "@/server/services/admin-finance";

/** Outbound email/SMS/WhatsApp delivery log. Recipients are masked and payloads are not returned. */
export const GET = route({ permission: "notification:manage", query: adminDeliveriesQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await adminListDeliveries(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
