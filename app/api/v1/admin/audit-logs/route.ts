import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { auditQuery } from "@/server/validation/admin";
import { listAuditLogs } from "@/server/services/admin-ops";

export const GET = route({ permission: "audit:read", query: auditQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await listAuditLogs(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
