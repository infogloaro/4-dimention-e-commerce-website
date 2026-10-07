import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { registerBody } from "@/server/validation/auth";
import { register, toPublicUser } from "@/server/services/auth";
import { authenticateToken } from "@/server/auth/session";
import { issueSessionResponse } from "@/server/core/auth-response";
import { clearGuestCartCookie } from "@/server/core/session-cookie";

export const POST = route({ body: registerBody, rateLimit: RL.auth }, async (ctx) => {
  const { sessionToken } = await register(ctx.body, { ip: ctx.ip, userAgent: ctx.userAgent }, ctx.guestToken);
  clearGuestCartCookie(ctx);
  const user = await authenticateToken(sessionToken);
  return created({ user: user ? toPublicUser(user) : null, session: issueSessionResponse(ctx, sessionToken) });
});
