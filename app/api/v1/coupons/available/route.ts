import { route, reply, publicCache } from "@/server/core/http";
import { getPublicOffers } from "@/server/services/catalog/product";

/** Publicly advertised offers for cart / checkout banners. */
export const GET = route({}, async () => reply(await getPublicOffers(), { headers: publicCache(60, 300) }));
