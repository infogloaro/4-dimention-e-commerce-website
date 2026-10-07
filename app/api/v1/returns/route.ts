import { route } from "@/server/core/http";
import { paginated, paginationSchema } from "@/server/core/pagination";
import { listReturns } from "@/server/services/returns";

export const GET = route({ auth: "required", query: paginationSchema }, async (ctx) => {
  const { items, total } = await listReturns(ctx.requireUser().id, ctx.query.page, ctx.query.pageSize);
  return paginated(items, ctx.query, total);
});
