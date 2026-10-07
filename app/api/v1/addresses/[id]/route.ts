import { route, noContent } from "@/server/core/http";
import { idParams } from "@/server/validation/common";
import { updateAddressBody } from "@/server/validation/commerce";
import { deleteAddress, getAddress, updateAddress } from "@/server/services/customer";

export const GET = route({ auth: "required", params: idParams }, (ctx) => getAddress(ctx.requireUser().id, ctx.params.id));
export const PATCH = route({ auth: "required", params: idParams, body: updateAddressBody }, (ctx) => updateAddress(ctx.requireUser().id, ctx.params.id, ctx.body));
export const DELETE = route({ auth: "required", params: idParams }, async (ctx) => {
  await deleteAddress(ctx.requireUser().id, ctx.params.id);
  return noContent();
});
