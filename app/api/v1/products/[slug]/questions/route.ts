import { route, created, reply } from "@/server/core/http";
import { slugParams } from "@/server/validation/common";
import { paginated, paginationSchema } from "@/server/core/pagination";
import { questionBody } from "@/server/validation/orders";
import { askQuestion, listQuestions } from "@/server/services/reviews";
import { productIdBySlug } from "@/server/services/recommendations";

export const GET = route({ params: slugParams, query: paginationSchema }, async (ctx) => {
  const res = await listQuestions(await productIdBySlug(ctx.params.slug), ctx.query.page, ctx.query.pageSize);
  const page = paginated(res.items, ctx.query, res.total);
  return reply(page.items, { meta: page.meta });
});
export const POST = route({ params: slugParams, body: questionBody, auth: "required" }, async (ctx) => created(await askQuestion(ctx.requireUser(), await productIdBySlug(ctx.params.slug), ctx.body.question)));
