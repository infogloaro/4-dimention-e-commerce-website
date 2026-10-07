import { env } from "./env";
import type { HandlerCtx } from "./http";
import type { CartOwner } from "../services/cart";

export const cartOwner = (ctx: Pick<HandlerCtx<unknown, unknown, unknown>, "user" | "guestToken">): CartOwner => ({ userId: ctx.user?.id ?? null, guestToken: ctx.guestToken });

export function setGuestCartCookie(ctx: Pick<HandlerCtx<unknown, unknown, unknown>, "cookies">, token: string | null) {
  if (token) ctx.cookies.set(env.CART_COOKIE_NAME, token, { maxAgeSec: 30 * 86_400 });
}
