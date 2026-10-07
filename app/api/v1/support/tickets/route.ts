import { route, created, reply } from "@/server/core/http";
import { paginated, paginationSchema } from "@/server/core/pagination";
import { ticketBody } from "@/server/validation/orders";
import { createTicket, listMyTickets } from "@/server/services/support";

export const GET = route({ auth: "required", query: paginationSchema }, async (ctx) => {
  const { items, total } = await listMyTickets(ctx.requireUser().id, ctx.query.page, ctx.query.pageSize);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
export const POST = route({ auth: "required", body: ticketBody }, async (ctx) => created(await createTicket(ctx.requireUser(), ctx.body)));
