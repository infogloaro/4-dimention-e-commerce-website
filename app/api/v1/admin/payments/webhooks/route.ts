import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { adminListWebhookEvents, adminWebhooksQuery } from "@/server/services/admin-finance";

/** Received payment-provider webhook events and their processing outcome (payloads are not returned). */
export const GET = route({ permission: "order:read", query: adminWebhooksQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await adminListWebhookEvents(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
