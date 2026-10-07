import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { adjustStockBody } from "@/server/validation/admin";
import { adjustStock } from "@/server/services/inventory";

/** Signed stock adjustment with a mandatory reason. Cannot push on-hand below reserved units. Audited. */
export const POST = route({ permission: "inventory:write", body: adjustStockBody, rateLimit: RL.admin }, (ctx) => adjustStock(ctx.requireUser(), ctx.body));
