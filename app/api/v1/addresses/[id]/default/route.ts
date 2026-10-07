import { route } from "@/server/core/http";
import { idParams } from "@/server/validation/common";
import { setDefaultAddress } from "@/server/services/customer";

export const POST = route({ auth: "required", params: idParams }, (ctx) => setDefaultAddress(ctx.requireUser().id, ctx.params.id));
