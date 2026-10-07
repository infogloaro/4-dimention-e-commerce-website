import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { getCustomer } from "@/server/services/admin-ops";

export const GET = route({ permission: "customer:read", params: idParams, rateLimit: RL.admin }, (ctx) => getCustomer(ctx.params.id));
