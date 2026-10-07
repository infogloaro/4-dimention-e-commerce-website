import { route, created, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { adminProductsQuery } from "@/server/validation/admin";
import { createProductBody } from "@/server/validation/catalog";
import { adminListProducts, createProduct } from "@/server/services/catalog/admin-products";
import { paginated } from "@/server/core/pagination";

export const GET = route({ permission: "product:read", query: adminProductsQuery, rateLimit: RL.admin }, async (ctx) => {
  const { items, total } = await adminListProducts(ctx.query);
  const p = paginated(items, ctx.query, total);
  return reply(p.items, { meta: p.meta });
});

export const POST = route({ permission: "product:write", body: createProductBody, rateLimit: RL.admin, maxBodyBytes: 2_000_000 }, async (ctx) => created(await createProduct(ctx.requireUser(), ctx.body)));
