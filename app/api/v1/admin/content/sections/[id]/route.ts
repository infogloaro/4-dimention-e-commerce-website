import { route, noContent } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { deleteSection } from "@/server/services/content";

export const DELETE = route({ permission: "content:write", params: idParams, rateLimit: RL.admin }, async (ctx) => {
  await deleteSection(ctx.requireUser(), ctx.params.id);
  return noContent();
});
