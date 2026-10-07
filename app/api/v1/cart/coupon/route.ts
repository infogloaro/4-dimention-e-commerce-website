import { route } from "@/server/core/http";
import { cartOwner, setGuestCartCookie } from "@/server/core/cart-http";
import { couponBody } from "@/server/validation/commerce";
import { applyCoupon, removeCoupon, viewCart } from "@/server/services/cart";

export const POST = route({ auth: "optional", body: couponBody }, async (ctx) => {
  const { newGuestToken } = await applyCoupon(cartOwner(ctx), ctx.body.code);
  setGuestCartCookie(ctx, newGuestToken);
  return viewCart(newGuestToken ? { guestToken: newGuestToken } : cartOwner(ctx));
});

export const DELETE = route({ auth: "optional", body: couponBody }, async (ctx) => {
  await removeCoupon(cartOwner(ctx), ctx.body.code);
  return viewCart(cartOwner(ctx));
});
