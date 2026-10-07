import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { phoneOtpVerifyBody } from "@/server/validation/auth";
import { verifyPhoneOtp } from "@/server/services/auth";

export const POST = route({ auth: "required", body: phoneOtpVerifyBody, rateLimit: RL.sensitive }, (ctx) => verifyPhoneOtp(ctx.requireUser(), ctx.body.code));
