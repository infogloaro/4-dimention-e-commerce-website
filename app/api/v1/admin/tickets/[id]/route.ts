import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { staffReplyBody, ticketStatusBody } from "@/server/validation/admin";
import { adminGetTicket, setTicketStatus, staffReply } from "@/server/services/support";

export const GET = route({ permission: "support:read", params: idParams, rateLimit: RL.admin }, (ctx) => adminGetTicket(ctx.params.id));
export const POST = route({ permission: "support:reply", params: idParams, body: staffReplyBody, rateLimit: RL.admin }, (ctx) => staffReply(ctx.requireUser(), ctx.params.id, ctx.body.message, ctx.body.status));
export const PATCH = route({ permission: "support:reply", params: idParams, body: ticketStatusBody, rateLimit: RL.admin }, async (ctx) => {
  await setTicketStatus(ctx.requireUser(), ctx.params.id, ctx.body.status);
  return { status: ctx.body.status };
});
