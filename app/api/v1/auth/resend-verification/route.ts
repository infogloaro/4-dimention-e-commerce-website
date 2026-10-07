import { route, accepted } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { resendVerification } from "@/server/services/auth";

export const POST = route({ auth: "required", rateLimit: RL.sensitive }, async (ctx) => {
  await resendVerification(ctx.requireUser());
  return accepted({ message: "Verification email sent if your address is not yet verified." });
});
