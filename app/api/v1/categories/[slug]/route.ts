import { route, reply, publicCache } from "@/server/core/http";
import { slugParams } from "@/server/validation/common";
import { getCategoryDetail } from "@/server/services/catalog/categories";

export const GET = route({ params: slugParams }, async (ctx) => reply(await getCategoryDetail(ctx.params.slug), { headers: publicCache(60, 300) }));
