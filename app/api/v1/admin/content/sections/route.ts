import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { sectionBody, reorderBody } from "@/server/validation/admin";
import { listSections, reorderSections, upsertSection } from "@/server/services/content";

export const GET = route({ permission: "content:write", rateLimit: RL.admin }, () => listSections());
/** Create or replace a home section by `key`. */
export const PUT = route({ permission: "content:write", body: sectionBody, rateLimit: RL.admin }, (ctx) => upsertSection(ctx.requireUser(), ctx.body as never));
export const PATCH = route({ permission: "content:write", body: reorderBody, rateLimit: RL.admin }, async (ctx) => {
  await reorderSections(ctx.requireUser(), ctx.body.items);
  return { reordered: ctx.body.items.length };
});
