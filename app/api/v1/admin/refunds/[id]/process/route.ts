import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { finalizeRefund } from "@/server/services/refunds";
import { db } from "@/server/db/client";
import { notFound } from "@/server/core/errors";

/** Confirm an offline refund (COD / bank transfer) has been paid out. Idempotent. */
export const POST = route({ permission: "order:refund", params: idParams, rateLimit: RL.admin }, async (ctx) => {
  const r = await db.refund.findUnique({ where: { id: ctx.params.id } });
  if (!r) throw notFound("ORDER_NOT_FOUND", "Refund");
  return (await finalizeRefund(r.id, { actor: ctx.requireUser() })) ?? r;
});
