import { route, created } from "@/server/core/http";
import { cartOwner, setGuestCartCookie } from "@/server/core/cart-http";
import { addCartItemBody } from "@/server/validation/commerce";
import { addItem, viewCart } from "@/server/services/cart";

export const POST = route({ auth: "optional", body: addCartItemBody }, async (ctx) => {
  const { newGuestToken } = await addItem(cartOwner(ctx), ctx.body);
  setGuestCartCookie(ctx, newGuestToken);
  const owner = newGuestToken ? { userId: null, guestToken: newGuestToken } : cartOwner(ctx);
  return created(await viewCart(owner));
});
