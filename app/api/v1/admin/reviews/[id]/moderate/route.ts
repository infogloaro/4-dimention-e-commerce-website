import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { moderationBody } from "@/server/validation/orders";
import { moderateReview } from "@/server/services/reviews";

export const POST = route({ permission: "review:moderate", params: idParams, body: moderationBody, rateLimit: RL.admin }, async (ctx) => {
  await moderateReview(ctx.requireUser(), ctx.params.id, ctx.body);
  return { status: ctx.body.approve ? "APPROVED" : "REJECTED" };
});
