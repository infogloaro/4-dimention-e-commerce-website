import { route } from "@/server/core/http";
import { cartOwner } from "@/server/core/cart-http";
import { idParams } from "@/server/validation/common";
import { updateCartItemBody } from "@/server/validation/commerce";
import { removeItem, updateItem, viewCart } from "@/server/services/cart";

export const PATCH = route({ auth: "optional", params: idParams, body: updateCartItemBody }, async (ctx) => {
  await updateItem(cartOwner(ctx), ctx.params.id, ctx.body);
  return viewCart(cartOwner(ctx));
});

export const DELETE = route({ auth: "optional", params: idParams }, async (ctx) => {
  await removeItem(cartOwner(ctx), ctx.params.id);
  return viewCart(cartOwner(ctx));
});
