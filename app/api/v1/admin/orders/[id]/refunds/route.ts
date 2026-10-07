import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { AppError } from "@/server/core/errors";
import { assertIdempotencyKey } from "@/server/core/idempotency";
import { idParams } from "@/server/validation/common";
import { refundBody } from "@/server/validation/orders";
import { refundOrder } from "@/server/services/refunds";
import { audit } from "@/server/services/audit";

/** Manual (partial or full) refund. `Idempotency-Key` required: a retried request can never refund twice. */
export const POST = route({ permission: "order:refund", params: idParams, body: refundBody, rateLimit: RL.admin }, async (ctx) => {
  const actor = ctx.requireUser();
  const key = assertIdempotencyKey(ctx.req.headers.get("idempotency-key"));
  if (key.startsWith("cancel:") || key.startsWith("return:") || key.startsWith("late-capture:")) throw new AppError("BAD_REQUEST", "That Idempotency-Key prefix is reserved");
  const refund = await refundOrder({ orderId: ctx.params.id, amount: ctx.body.amount, reason: ctx.body.reason, actor, idempotencyKey: `admin:${ctx.params.id}:${key}` });
  await audit({ action: "refund.issued", resourceType: "refund", resourceId: refund.id, actor, metadata: { orderId: ctx.params.id, amount: refund.amount, status: refund.status } });
  return created(refund);
});
