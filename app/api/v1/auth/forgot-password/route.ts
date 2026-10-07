import { route, accepted } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { forgotPasswordBody } from "@/server/validation/auth";
import { requestPasswordReset } from "@/server/services/auth";

export const POST = route({ body: forgotPasswordBody, rateLimit: RL.sensitive }, async (ctx) => {
  await requestPasswordReset(ctx.body.email);
  return accepted({ message: "If an account exists for that email, a reset link has been sent." });
});
