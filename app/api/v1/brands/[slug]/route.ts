import { route, reply, publicCache } from "@/server/core/http";
import { slugParams } from "@/server/validation/common";
import { getBrand } from "@/server/services/catalog/brands";

export const GET = route({ params: slugParams }, async (ctx) => reply(await getBrand(ctx.params.slug), { headers: publicCache(60, 300) }));
