import { route, noContent } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { updateCategoryBody } from "@/server/validation/admin";
import { deleteCategory, updateCategory } from "@/server/services/catalog/admin-taxonomy";

export const PATCH = route({ permission: "category:write", params: idParams, body: updateCategoryBody, rateLimit: RL.admin }, (ctx) => updateCategory(ctx.requireUser(), ctx.params.id, ctx.body));
export const DELETE = route({ permission: "category:write", params: idParams, rateLimit: RL.admin }, async (ctx) => {
  await deleteCategory(ctx.requireUser(), ctx.params.id);
  return noContent();
});
