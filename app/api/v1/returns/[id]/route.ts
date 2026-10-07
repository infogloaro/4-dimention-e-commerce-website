import { route } from "@/server/core/http";
import { idParams } from "@/server/validation/common";
import { getReturn } from "@/server/services/returns";

export const GET = route({ auth: "required", params: idParams }, (ctx) => getReturn(ctx.requireUser().id, ctx.params.id));
