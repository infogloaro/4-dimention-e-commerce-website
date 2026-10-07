import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { bulkProductsBody } from "@/server/validation/catalog";
import { bulkUpdateProducts } from "@/server/services/catalog/admin-products";
import { AppError } from "@/server/core/errors";

export const POST = route({ permission: "product:write", body: bulkProductsBody, rateLimit: RL.admin }, (ctx) => {
  if (ctx.body.action === "archive" && !ctx.requireUser().permissions.has("product:delete")) throw new AppError("FORBIDDEN", "Archiving requires the product:delete permission");
  return bulkUpdateProducts(ctx.requireUser(), ctx.body);
});
