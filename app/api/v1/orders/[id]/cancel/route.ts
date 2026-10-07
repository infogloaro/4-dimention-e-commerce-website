import { route } from "@/server/core/http";
import { idParams } from "@/server/validation/common";
import { cancelOrderBody } from "@/server/validation/orders";
import { cancelOrderByCustomer } from "@/server/services/orders";

export const POST = route({ auth: "required", params: idParams, body: cancelOrderBody }, (ctx) => cancelOrderByCustomer(ctx.requireUser(), ctx.params.id, ctx.body.reason));
