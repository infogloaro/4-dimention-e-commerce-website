import { z } from "zod";
import { route, noContent } from "@/server/core/http";
import { id } from "@/server/validation/common";
import { removeFromWishlist } from "@/server/services/customer";

export const DELETE = route({ auth: "required", params: z.object({ productId: id }) }, async (ctx) => {
  await removeFromWishlist(ctx.requireUser().id, ctx.params.productId);
  return noContent();
});
