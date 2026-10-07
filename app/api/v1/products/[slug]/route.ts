import { route, reply, publicCache } from "@/server/core/http";
import { slugParams } from "@/server/validation/common";
import { getProductDetail } from "@/server/services/catalog/product";

export const GET = route({ params: slugParams }, async (ctx) => reply(await getProductDetail(ctx.params.slug), { headers: publicCache(30, 120) }));
