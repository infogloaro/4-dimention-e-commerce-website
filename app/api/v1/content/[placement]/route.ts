import { z } from "zod";
import { route, reply, publicCache } from "@/server/core/http";
import { blocksFor } from "@/server/services/content";

/** Active banners / promos for a placement, e.g. `category:audio`, `site.announcement`. */
export const GET = route({ params: z.object({ placement: z.string().regex(/^[a-z0-9_.:\-]{2,60}$/) }) }, async (ctx) => reply(await blocksFor(ctx.params.placement), { headers: publicCache(30, 120) }));
