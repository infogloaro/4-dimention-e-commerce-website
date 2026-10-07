import { route, reply } from "@/server/core/http";
import { getHome } from "@/server/services/content";

/** Everything the home page needs, assembled from admin-managed sections (hero, rails, promos, personalised, recently viewed). */
export const GET = route({ auth: "optional" }, async (ctx) => {
  const data = await getHome({ userId: ctx.user?.id, guestToken: ctx.guestToken });
  const personal = ctx.user || ctx.guestToken;
  return reply(data, { headers: { "Cache-Control": personal ? "private, no-store" : "public, s-maxage=30, stale-while-revalidate=120" } });
});
