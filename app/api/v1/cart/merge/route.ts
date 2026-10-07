import { route } from "@/server/core/http";
import { clearGuestCartCookie } from "@/server/core/session-cookie";
import { mergeGuestCart, viewCart } from "@/server/services/cart";

/** Login/register already merge automatically; this lets a client force a merge (e.g. after OAuth-style flows). */
export const POST = route({ auth: "required" }, async (ctx) => {
  const user = ctx.requireUser();
  if (ctx.guestToken) await mergeGuestCart(user.id, ctx.guestToken);
  clearGuestCartCookie(ctx);
  return viewCart({ userId: user.id });
});
