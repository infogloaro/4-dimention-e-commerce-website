import { route, noContent } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { variantPatchBody } from "@/server/validation/admin";
import { removeVariant, updateVariant } from "@/server/services/catalog/admin-products";

export const PATCH = route({ permission: "product:write", params: idParams, body: variantPatchBody, rateLimit: RL.admin }, async (ctx) => {
  await updateVariant(ctx.requireUser(), ctx.params.id, ctx.body);
  return { updated: true };
});
export const DELETE = route({ permission: "product:write", params: idParams, rateLimit: RL.admin }, async (ctx) => {
  await removeVariant(ctx.requireUser(), ctx.params.id);
  return noContent();
});
