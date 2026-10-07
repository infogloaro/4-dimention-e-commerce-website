import { route, created } from "@/server/core/http";
import { wishlistAddBody } from "@/server/validation/commerce";
import { addToWishlist, listWishlist, wishlistProductIds } from "@/server/services/customer";
import { z } from "zod";

export const GET = route({ auth: "required", query: z.object({ idsOnly: z.enum(["true", "false"]).optional() }) }, async (ctx) => {
  const user = ctx.requireUser();
  return ctx.query.idsOnly === "true" ? { productIds: await wishlistProductIds(user.id) } : { items: await listWishlist(user.id) };
});

export const POST = route({ auth: "required", body: wishlistAddBody }, async (ctx) => created(await addToWishlist(ctx.requireUser().id, ctx.body)));
