import { route, created, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { paginated } from "@/server/core/pagination";
import { couponBody, couponsQuery } from "@/server/validation/admin";
import { createCoupon, listCoupons } from "@/server/services/admin-ops";

export const GET = route({ permission: "coupon:read", query: couponsQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await listCoupons(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});
export const POST = route({ permission: "coupon:write", body: couponBody, rateLimit: RL.admin }, async (ctx) => created(await createCoupon(ctx.requireUser(), ctx.body)));
