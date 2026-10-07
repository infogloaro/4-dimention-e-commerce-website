import { route } from "@/server/core/http";
import { idParams } from "@/server/validation/common";
import { toggleHelpful } from "@/server/services/reviews";

/** Toggles the caller's "helpful" vote. */
export const POST = route({ auth: "required", params: idParams }, (ctx) => toggleHelpful(ctx.requireUser(), ctx.params.id));
