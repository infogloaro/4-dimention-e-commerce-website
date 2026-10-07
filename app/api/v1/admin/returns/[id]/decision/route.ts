import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { returnDecisionBody } from "@/server/validation/orders";
import { decideReturn } from "@/server/services/returns";

export const POST = route({ permission: "return:manage", params: idParams, body: returnDecisionBody, rateLimit: RL.admin }, (ctx) => decideReturn(ctx.requireUser(), ctx.params.id, ctx.body));
