import { z } from "zod";
import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { id } from "@/server/validation/common";
import { thresholdBody } from "@/server/validation/admin";
import { updateStockSettings } from "@/server/services/admin-inventory";

/** Low-stock threshold / backorder policy for one variant. */
export const PATCH = route({ permission: "inventory:write", params: z.object({ variantId: id }), body: thresholdBody, rateLimit: RL.admin }, (ctx) => updateStockSettings(ctx.requireUser(), ctx.params.variantId, ctx.body));
