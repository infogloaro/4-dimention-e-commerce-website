import { z } from "zod";
import { route, reply, publicCache } from "@/server/core/http";
import { boolParam } from "@/server/validation/common";
import { listBrands } from "@/server/services/catalog/brands";

export const GET = route({ query: z.object({ featured: boolParam.optional() }) }, async (ctx) => reply(await listBrands({ featured: ctx.query.featured }), { headers: publicCache(60, 300) }));
