import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { checkoutValidateBody } from "@/server/validation/commerce";
import { validateCheckout } from "@/server/services/checkout";

/** Dry-run: server-authoritative totals, shipping options, coupon results and stock issues. Creates nothing. */
export const POST = route({ auth: "required", body: checkoutValidateBody, rateLimit: RL.checkout }, (ctx) => validateCheckout(ctx.requireUser(), ctx.body));
