import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { transitionBody } from "@/server/validation/orders";
import { assertManualTransitionAllowed, transitionOrder } from "@/server/services/orders";

/** Move an order along the state machine; illegal transitions return ORDER_STATE_INVALID with the allowed targets. */
export const POST = route({ permission: "order:update", params: idParams, body: transitionBody, rateLimit: RL.admin }, async (ctx) => {
  await assertManualTransitionAllowed(ctx.params.id, ctx.body.status, ctx.body);
  return transitionOrder(ctx.requireUser(), ctx.params.id, ctx.body.status, { note: ctx.body.note, location: ctx.body.location, reason: ctx.body.reason });
});
