import { z } from "zod";
import { route } from "@/server/core/http";
import { id } from "@/server/validation/common";
import { viewCart } from "@/server/services/cart";
import { moveWishlistToCart } from "@/server/services/customer";

export const POST = route({ auth: "required", params: z.object({ productId: id }), body: z.object({ variantId: id.optional() }) }, async (ctx) => {
  const user = ctx.requireUser();
  await moveWishlistToCart({ userId: user.id }, ctx.params.productId, ctx.body.variantId);
  return viewCart({ userId: user.id });
});
