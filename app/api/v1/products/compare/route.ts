import { z } from "zod";
import { route } from "@/server/core/http";
import { arrayParam } from "@/server/validation/common";
import { compareProducts } from "@/server/services/catalog/product";

export const GET = route({ query: z.object({ ids: arrayParam(z.string().max(160)).pipe(z.array(z.string()).min(1).max(4)) }) }, (ctx) => compareProducts(ctx.query.ids));
