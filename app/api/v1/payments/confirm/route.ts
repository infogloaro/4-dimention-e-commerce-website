import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { confirmPaymentBody } from "@/server/validation/commerce";
import { confirmPayment } from "@/server/services/payments";

/** Client reports the provider result; the server verifies it with the provider before changing anything. Idempotent. */
export const POST = route({ auth: "required", body: confirmPaymentBody, rateLimit: RL.checkout }, (ctx) => confirmPayment(ctx.requireUser().id, ctx.body));
