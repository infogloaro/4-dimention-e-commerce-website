import { z } from "zod";
import { route, reply } from "@/server/core/http";
import { boolParam, paginationSchemaRef } from "@/server/validation/common";
import { paginated } from "@/server/core/pagination";
import { listNotifications, markRead } from "@/server/services/notifications";

export const GET = route({ auth: "required", query: z.object({ unreadOnly: boolParam.optional(), ...paginationSchemaRef }) }, async (ctx) => {
  const res = await listNotifications(ctx.requireUser().id, ctx.query);
  const page = paginated(res.items, ctx.query, res.total);
  return reply(page.items, { meta: { ...page.meta, unread: res.unread } });
});

/** Mark all (no body ids) or specific notifications as read. */
export const POST = route({ auth: "required", body: z.object({ ids: z.array(z.string().uuid()).max(100).optional() }) }, (ctx) => markRead(ctx.requireUser().id, ctx.body.ids));
