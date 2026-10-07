import { route, noContent } from "@/server/core/http";
import { slugParams } from "@/server/validation/common";
import { productIdBySlug, recordView } from "@/server/services/recommendations";

/** Fire from the product page after render to feed "Recently viewed" and popularity. */
export const POST = route({ params: slugParams, auth: "optional" }, async (ctx) => {
  await recordView(await productIdBySlug(ctx.params.slug), { userId: ctx.user?.id, guestToken: ctx.guestToken });
  return noContent();
});
