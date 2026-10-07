import { z } from "zod";
import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { blockBody } from "@/server/validation/admin";
import { createBlock, listBlocks } from "@/server/services/content";

export const GET = route({ permission: "content:write", query: z.object({ placement: z.string().max(60).optional() }), rateLimit: RL.admin }, (ctx) => listBlocks(ctx.query.placement));
export const POST = route({ permission: "content:write", body: blockBody, rateLimit: RL.admin }, async (ctx) => created(await createBlock(ctx.requireUser(), ctx.body as never)));
