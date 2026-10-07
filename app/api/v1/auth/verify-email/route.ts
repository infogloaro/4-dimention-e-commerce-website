import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { verifyEmailBody } from "@/server/validation/auth";
import { verifyEmail } from "@/server/services/auth";

export const POST = route({ body: verifyEmailBody, rateLimit: RL.auth }, async (ctx) => verifyEmail(ctx.body.token));
