import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { answerBody } from "@/server/validation/admin";
import { moderationBody } from "@/server/validation/orders";
import { answerQuestion, moderateQuestion } from "@/server/services/reviews";

/** Approve / reject a customer question. */
export const PATCH = route({ permission: "review:moderate", params: idParams, body: moderationBody, rateLimit: RL.admin }, async (ctx) => {
  await moderateQuestion(ctx.requireUser(), ctx.params.id, ctx.body.approve);
  return { status: ctx.body.approve ? "APPROVED" : "REJECTED" };
});
/** Post an official answer (also approves the question). */
export const POST = route({ permission: "review:moderate", params: idParams, body: answerBody, rateLimit: RL.admin }, async (ctx) => created(await answerQuestion(ctx.requireUser(), ctx.params.id, ctx.body.body)));
