import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { resetPasswordBody } from "@/server/validation/auth";
import { resetPassword } from "@/server/services/auth";

export const POST = route({ body: resetPasswordBody, rateLimit: RL.sensitive }, async (ctx) => {
  await resetPassword(ctx.body.token, ctx.body.password);
  return { message: "Password updated. Please sign in with your new password." };
});
