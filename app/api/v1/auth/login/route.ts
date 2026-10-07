import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { loginBody } from "@/server/validation/auth";
import { login, toPublicUser } from "@/server/services/auth";
import { authenticateToken } from "@/server/auth/session";
import { issueSessionResponse } from "@/server/core/auth-response";
import { clearGuestCartCookie } from "@/server/core/session-cookie";

export const POST = route({ body: loginBody, rateLimit: RL.authLogin }, async (ctx) => {
  const { sessionToken } = await login(ctx.body, { ip: ctx.ip, userAgent: ctx.userAgent }, ctx.guestToken);
  clearGuestCartCookie(ctx);
  const user = await authenticateToken(sessionToken);
  return { user: user ? toPublicUser(user) : null, session: issueSessionResponse(ctx, sessionToken) };
});
