import { route, noContent } from "@/server/core/http";
import { cartOwner } from "@/server/core/cart-http";
import { cartQuery } from "@/server/validation/commerce";
import { clearCart, viewCart } from "@/server/services/cart";
import { getAddress } from "@/server/services/customer";

export const GET = route({ auth: "optional", query: cartQuery }, async (ctx) => {
  let address = ctx.query.postalCode ? { postalCode: ctx.query.postalCode, state: ctx.query.state, country: "IN" } : null;
  if (ctx.query.addressId && ctx.user) {
    const a = await getAddress(ctx.user.id, ctx.query.addressId);
    address = { postalCode: a.postalCode, state: a.state, country: a.country };
  }
  return viewCart(cartOwner(ctx), { address, shippingMethod: ctx.query.shippingMethod });
});

export const DELETE = route({ auth: "optional" }, async (ctx) => {
  await clearCart(cartOwner(ctx));
  return noContent();
});
