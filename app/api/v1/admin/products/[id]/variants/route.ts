import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { variantInput } from "@/server/validation/catalog";
import { addVariant } from "@/server/services/catalog/admin-products";

export const POST = route({ permission: "product:write", params: idParams, body: variantInput, rateLimit: RL.admin }, async (ctx) => created(await addVariant(ctx.requireUser(), ctx.params.id, ctx.body)));
