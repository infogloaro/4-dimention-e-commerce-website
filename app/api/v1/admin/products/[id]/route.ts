import { route, noContent } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { notFound } from "@/server/core/errors";
import { db } from "@/server/db/client";
import { idParams } from "@/server/validation/common";
import { updateProductBody } from "@/server/validation/catalog";
import { archiveProduct, updateProduct } from "@/server/services/catalog/admin-products";
import { getProductDetail } from "@/server/services/catalog/product";

async function detailById(id: string) {
  const p = await db.product.findFirst({ where: { id, deletedAt: null }, select: { slug: true } });
  if (!p) throw notFound("PRODUCT_NOT_FOUND", "Product");
  return getProductDetail(p.slug, { includeDrafts: true });
}

export const GET = route({ permission: "product:read", params: idParams, rateLimit: RL.admin }, (ctx) => detailById(ctx.params.id));

export const PATCH = route({ permission: "product:write", params: idParams, body: updateProductBody, rateLimit: RL.admin, maxBodyBytes: 2_000_000 }, async (ctx) => {
  await updateProduct(ctx.requireUser(), ctx.params.id, ctx.body);
  return detailById(ctx.params.id);
});

/** Soft delete: product is archived and hidden; order history keeps its snapshots. */
export const DELETE = route({ permission: "product:delete", params: idParams, rateLimit: RL.admin }, async (ctx) => {
  await archiveProduct(ctx.requireUser(), ctx.params.id);
  return noContent();
});
