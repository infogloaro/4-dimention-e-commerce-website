import { route } from "@/server/core/http";
import { idParams } from "@/server/validation/common";
import { cancelReturn } from "@/server/services/returns";

export const POST = route({ auth: "required", params: idParams }, (ctx) => cancelReturn(ctx.requireUser(), ctx.params.id));
