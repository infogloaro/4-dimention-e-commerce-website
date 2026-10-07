import { route, noContent } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { updateBlockBody } from "@/server/validation/admin";
import { deleteBlock, updateBlock } from "@/server/services/content";

export const PATCH = route({ permission: "content:write", params: idParams, body: updateBlockBody, rateLimit: RL.admin }, (ctx) => updateBlock(ctx.requireUser(), ctx.params.id, ctx.body as never));
export const DELETE = route({ permission: "content:write", params: idParams, rateLimit: RL.admin }, async (ctx) => {
  await deleteBlock(ctx.requireUser(), ctx.params.id);
  return noContent();
});
