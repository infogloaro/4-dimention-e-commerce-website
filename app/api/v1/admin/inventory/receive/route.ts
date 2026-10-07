import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { receiveStockBody } from "@/server/validation/admin";
import { receiveStock } from "@/server/services/inventory";

/** Record a supplier receipt (restock). `reference` is unique, so a double-submit cannot double-count stock. */
export const POST = route({ permission: "inventory:write", body: receiveStockBody, rateLimit: RL.admin }, async (ctx) => created(await receiveStock(ctx.requireUser(), ctx.body)));
