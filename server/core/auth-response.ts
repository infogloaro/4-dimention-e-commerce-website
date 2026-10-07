import type { HandlerCtx } from "./http";
import { setSessionCookie } from "./session-cookie";
import { sessionExpiry } from "../auth/session";

/** Browsers get an httpOnly cookie. Non-browser clients opt in to receiving the token with `X-Auth-Mode: token`. */
export function issueSessionResponse(ctx: HandlerCtx<unknown, unknown, unknown>, token: string) {
  setSessionCookie(ctx, token);
  const expiresAt = sessionExpiry().toISOString();
  return ctx.req.headers.get("x-auth-mode") === "token" ? { token, expiresAt } : { expiresAt };
}
