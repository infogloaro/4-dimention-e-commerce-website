import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { adminListShipments, adminShipmentsQuery } from "@/server/services/admin-finance";

/** Shipments across all orders, with filters for delivery exceptions and missing tracking numbers. */
export const GET = route({ permission: ["order:read", "shipping:manage"], permissionMode: "any", query: adminShipmentsQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await adminListShipments(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
