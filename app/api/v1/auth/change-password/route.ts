import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { changePasswordBody } from "@/server/validation/auth";
import { changePassword } from "@/server/services/auth";

export const POST = route({ auth: "required", body: changePasswordBody, rateLimit: RL.sensitive }, async (ctx) => {
  await changePassword(ctx.requireUser(), ctx.body.currentPassword, ctx.body.newPassword);
  return { message: "Password changed. Other devices were signed out." };
});
