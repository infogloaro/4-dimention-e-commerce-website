import { route, created } from "@/server/core/http";
import { idParams } from "@/server/validation/common";
import { returnBody } from "@/server/validation/orders";
import { requestReturn } from "@/server/services/returns";

export const POST = route({ auth: "required", params: idParams, body: returnBody }, async (ctx) => created(await requestReturn(ctx.requireUser(), ctx.params.id, ctx.body)));
