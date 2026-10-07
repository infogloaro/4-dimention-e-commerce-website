import { z } from "zod";
import { route, noContent } from "@/server/core/http";
import { clearRecentlyViewed, recentlyViewed } from "@/server/services/recommendations";

export const GET = route({ auth: "optional", query: z.object({ limit: z.coerce.number().int().min(1).max(30).default(12) }) }, (ctx) =>
  recentlyViewed({ userId: ctx.user?.id, guestToken: ctx.guestToken }, ctx.query.limit),
);
export const DELETE = route({ auth: "optional" }, async (ctx) => {
  await clearRecentlyViewed({ userId: ctx.user?.id, guestToken: ctx.guestToken });
  return noContent();
});
