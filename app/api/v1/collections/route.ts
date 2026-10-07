import { route, reply, publicCache } from "@/server/core/http";
import { listCollections } from "@/server/services/catalog/brands";

export const GET = route({}, async () => reply(await listCollections(), { headers: publicCache(60, 300) }));
