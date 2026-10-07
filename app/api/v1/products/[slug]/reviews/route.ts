import { route, created } from "@/server/core/http";
import { slugParams } from "@/server/validation/common";
import { reviewBody, reviewListQuery } from "@/server/validation/orders";
import { createReview, listProductReviews } from "@/server/services/reviews";
import { productIdBySlug } from "@/server/services/recommendations";
import { paginated } from "@/server/core/pagination";
import { reply } from "@/server/core/http";

export const GET = route({ params: slugParams, query: reviewListQuery, auth: "optional" }, async (ctx) => {
  const res = await listProductReviews(await productIdBySlug(ctx.params.slug), ctx.query, ctx.user?.id);
  const page = paginated(res.items, ctx.query, res.total);
  return reply(page.items, { meta: { ...page.meta, summary: res.summary } });
});

export const POST = route({ params: slugParams, body: reviewBody, auth: "required" }, async (ctx) => created(await createReview(ctx.requireUser(), await productIdBySlug(ctx.params.slug), ctx.body)));
