import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { roleChangeBody } from "@/server/validation/admin";
import { changeUserRole } from "@/server/services/admin-ops";

/** Change a user's role. Revokes their sessions so the new permission set applies immediately. Audited as `user.role_changed`. */
export const PATCH = route({ permission: "user:manage", params: idParams, body: roleChangeBody, rateLimit: RL.admin }, async (ctx) => {
  await changeUserRole(ctx.requireUser(), ctx.params.id, ctx.body.roleKey);
  return { roleKey: ctx.body.roleKey };
});
