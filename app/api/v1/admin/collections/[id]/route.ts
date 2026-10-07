import { route, noContent } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { updateCollectionBody } from "@/server/validation/admin";
import { deleteCollection, updateCollection } from "@/server/services/catalog/admin-taxonomy";

export const PATCH = route({ permission: "collection:write", params: idParams, body: updateCollectionBody, rateLimit: RL.admin }, (ctx) => updateCollection(ctx.requireUser(), ctx.params.id, ctx.body));
export const DELETE = route({ permission: "collection:write", params: idParams, rateLimit: RL.admin }, async (ctx) => {
  await deleteCollection(ctx.requireUser(), ctx.params.id);
  return noContent();
});
