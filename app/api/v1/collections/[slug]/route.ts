import { route, reply, publicCache } from "@/server/core/http";
import { slugParams } from "@/server/validation/common";
import { getCollection } from "@/server/services/catalog/brands";

/** Collection metadata. Fetch its products via GET /products?collection=<slug>. */
export const GET = route({ params: slugParams }, async (ctx) => reply(await getCollection(ctx.params.slug), { headers: publicCache(60, 300) }));
