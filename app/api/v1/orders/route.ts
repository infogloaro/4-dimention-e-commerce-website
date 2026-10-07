import { route } from "@/server/core/http";
import { paginated } from "@/server/core/pagination";
import { listOrdersQuery } from "@/server/validation/orders";
import { listOrders } from "@/server/services/orders";

export const GET = route({ auth: "required", query: listOrdersQuery }, async (ctx) => {
  const { items, total } = await listOrders(ctx.requireUser().id, ctx.query);
  return paginated(items, ctx.query, total);
});
