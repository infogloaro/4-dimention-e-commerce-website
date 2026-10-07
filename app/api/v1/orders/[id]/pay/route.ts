import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { retryPayment } from "@/server/services/payments";

/** Retry payment for an order still waiting for it (reuses an open attempt if there is one). */
export const POST = route({ auth: "required", params: idParams, rateLimit: RL.checkout }, (ctx) => retryPayment(ctx.requireUser().id, ctx.params.id));
