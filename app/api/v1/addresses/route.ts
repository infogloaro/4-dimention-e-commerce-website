import { route, created } from "@/server/core/http";
import { addressBody } from "@/server/validation/commerce";
import { createAddress, listAddresses } from "@/server/services/customer";

export const GET = route({ auth: "required" }, (ctx) => listAddresses(ctx.requireUser().id));
export const POST = route({ auth: "required", body: addressBody }, async (ctx) => created(await createAddress(ctx.requireUser().id, ctx.body)));
