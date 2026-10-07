import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { brandBody } from "@/server/validation/admin";
import { createBrand, listAllBrands } from "@/server/services/catalog/admin-taxonomy";

export const GET = route({ permission: ["product:read", "brand:write"], permissionMode: "any", rateLimit: RL.admin }, () => listAllBrands());
export const POST = route({ permission: "brand:write", body: brandBody, rateLimit: RL.admin }, async (ctx) => created(await createBrand(ctx.requireUser(), ctx.body)));
