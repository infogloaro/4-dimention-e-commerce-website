import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { refresh } from "@/server/services/auth";
import { issueSessionResponse } from "@/server/core/auth-response";

export const POST = route({ auth: "required", rateLimit: RL.auth }, async (ctx) => {
  const { sessionToken } = await refresh(ctx.requireUser(), { ip: ctx.ip, userAgent: ctx.userAgent });
  return { session: issueSessionResponse(ctx, sessionToken) };
});
