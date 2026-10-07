import { route, accepted } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { phoneOtpRequestBody } from "@/server/validation/auth";
import { requestPhoneOtp } from "@/server/services/auth";

export const POST = route({ auth: "required", body: phoneOtpRequestBody, rateLimit: RL.sensitive }, async (ctx) => {
  await requestPhoneOtp(ctx.requireUser(), ctx.body.phone);
  return accepted({ message: "Verification code sent." });
});
