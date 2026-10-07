import { z } from "zod";
import { route } from "@/server/core/http";
import { getOrder } from "@/server/services/orders";

/** `id` may be the order UUID or the human order number (4D-YYMMDD-XXXXXX). */
export const GET = route({ auth: "required", params: z.object({ id: z.string().min(6).max(40) }) }, (ctx) => getOrder(ctx.requireUser().id, ctx.params.id));
