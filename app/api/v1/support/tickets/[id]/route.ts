import { route } from "@/server/core/http";
import { idParams } from "@/server/validation/common";
import { ticketReplyBody } from "@/server/validation/orders";
import { customerReply, getMyTicket } from "@/server/services/support";

export const GET = route({ auth: "required", params: idParams }, (ctx) => getMyTicket(ctx.requireUser().id, ctx.params.id));
export const POST = route({ auth: "required", params: idParams, body: ticketReplyBody }, (ctx) => customerReply(ctx.requireUser(), ctx.params.id, ctx.body.message));
