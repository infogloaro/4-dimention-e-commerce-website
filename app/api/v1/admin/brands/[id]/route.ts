import { route, noContent } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { updateBrandBody } from "@/server/validation/admin";
import { deleteBrand, updateBrand } from "@/server/services/catalog/admin-taxonomy";

export const PATCH = route({ permission: "brand:write", params: idParams, body: updateBrandBody, rateLimit: RL.admin }, (ctx) => updateBrand(ctx.requireUser(), ctx.params.id, ctx.body));
export const DELETE = route({ permission: "brand:write", params: idParams, rateLimit: RL.admin }, async (ctx) => {
  await deleteBrand(ctx.requireUser(), ctx.params.id);
  return noContent();
});
