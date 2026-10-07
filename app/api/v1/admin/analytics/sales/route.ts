import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { rangeQuery } from "@/server/validation/admin";
import { salesSeries } from "@/server/services/analytics";

export const GET = route({ permission: "analytics:read", query: rangeQuery, rateLimit: RL.admin }, (ctx) => salesSeries(ctx.query));
