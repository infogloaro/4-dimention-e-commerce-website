import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { categoryBody } from "@/server/validation/admin";
import { createCategory, listAllCategories } from "@/server/services/catalog/admin-taxonomy";

export const GET = route({ permission: ["product:read", "category:write"], permissionMode: "any", rateLimit: RL.admin }, () => listAllCategories());
export const POST = route({ permission: "category:write", body: categoryBody, rateLimit: RL.admin }, async (ctx) => created(await createCategory(ctx.requireUser(), ctx.body)));
