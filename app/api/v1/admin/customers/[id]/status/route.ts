import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { customerStatusBody } from "@/server/validation/admin";
import { setCustomerStatus } from "@/server/services/admin-ops";

/** Suspend / ban / reactivate. Non-active statuses immediately revoke every session. Audited. */
export const PATCH = route({ permission: "customer:write", params: idParams, body: customerStatusBody, rateLimit: RL.admin }, async (ctx) => {
  await setCustomerStatus(ctx.requireUser(), ctx.params.id, ctx.body.status, ctx.body.reason);
  return { status: ctx.body.status };
});
