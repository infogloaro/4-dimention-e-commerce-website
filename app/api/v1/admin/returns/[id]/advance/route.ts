import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { returnAdvanceBody } from "@/server/validation/orders";
import { advanceReturn } from "@/server/services/returns";

/** PICKUP_SCHEDULED → PICKED_UP → RECEIVED. RECEIVED restocks items and triggers the refund. */
export const POST = route({ permission: "return:manage", params: idParams, body: returnAdvanceBody, rateLimit: RL.admin }, (ctx) => advanceReturn(ctx.requireUser(), ctx.params.id, ctx.body.status, ctx.body));
