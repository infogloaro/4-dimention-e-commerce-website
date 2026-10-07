import { route, noContent } from "@/server/core/http";
import { idParams } from "@/server/validation/common";
import { updateReviewBody } from "@/server/validation/orders";
import { deleteOwnReview, updateOwnReview } from "@/server/services/reviews";

export const PATCH = route({ auth: "required", params: idParams, body: updateReviewBody }, async (ctx) => {
  await updateOwnReview(ctx.requireUser(), ctx.params.id, ctx.body);
  return { updated: true, status: "PENDING" };
});
export const DELETE = route({ auth: "required", params: idParams }, async (ctx) => {
  await deleteOwnReview(ctx.requireUser(), ctx.params.id);
  return noContent();
});
