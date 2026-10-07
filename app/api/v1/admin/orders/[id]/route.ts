import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { adminGetOrder } from "@/server/services/orders";

export const GET = route({ permission: "order:read", params: idParams, rateLimit: RL.admin }, (ctx) => adminGetOrder(ctx.params.id));
