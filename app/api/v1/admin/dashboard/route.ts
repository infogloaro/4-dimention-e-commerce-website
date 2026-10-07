import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { dashboard } from "@/server/services/analytics";

/** KPIs, 30-day trend, top products, low stock, recent orders — served from rollups + a 30 s cache. */
export const GET = route({ permission: "dashboard:read", rateLimit: RL.admin }, () => dashboard());
