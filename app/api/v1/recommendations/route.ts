import { route } from "@/server/core/http";
import { personalized, recentlyViewed, trending } from "@/server/services/recommendations";

/** Home-page recommendation groups in one call. */
export const GET = route({ auth: "optional" }, async (ctx) => {
  const viewer = { userId: ctx.user?.id, guestToken: ctx.guestToken };
  const [trend, recent, forYou] = await Promise.all([trending(12), recentlyViewed(viewer, 12), personalized(viewer, 12)]);
  return { trending: trend, recentlyViewed: recent, personalized: forYou };
});
