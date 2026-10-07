import { route, reply, publicCache } from "@/server/core/http";
import { getCategoryTree } from "@/server/services/catalog/categories";

/** Full nested category tree with product counts — one cached call powers mega-menus and category rails. */
export const GET = route({}, async () => reply(await getCategoryTree(), { headers: publicCache(60, 300) }));
