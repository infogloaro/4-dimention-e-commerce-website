import { route, noContent } from "@/server/core/http";
import { idParams } from "@/server/validation/common";
import { revokeUserSession } from "@/server/services/auth";

export const DELETE = route({ auth: "required", params: idParams }, async (ctx) => {
  await revokeUserSession(ctx.requireUser(), ctx.params.id);
  return noContent();
});
