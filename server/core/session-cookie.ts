import { env } from "./env";
import type { HandlerCtx } from "./http";

export function setSessionCookie(ctx: Pick<HandlerCtx<unknown, unknown, unknown>, "cookies">, token: string) {
  ctx.cookies.set(env.SESSION_COOKIE_NAME, token, { maxAgeSec: env.SESSION_TTL_DAYS * 86_400 });
}

export function clearSessionCookie(ctx: Pick<HandlerCtx<unknown, unknown, unknown>, "cookies">) {
  ctx.cookies.delete(env.SESSION_COOKIE_NAME);
}

export function clearGuestCartCookie(ctx: Pick<HandlerCtx<unknown, unknown, unknown>, "cookies">) {
  ctx.cookies.delete(env.CART_COOKIE_NAME);
}
