import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { reorderBody } from "@/server/validation/admin";
import { reorderCategories } from "@/server/services/catalog/admin-taxonomy";

export const POST = route({ permission: "category:write", body: reorderBody, rateLimit: RL.admin }, async (ctx) => {
  await reorderCategories(ctx.requireUser(), ctx.body.items);
  return { reordered: ctx.body.items.length };
});
