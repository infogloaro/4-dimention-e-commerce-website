import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { systemHealth } from "@/server/services/admin-finance";

/** Integration readiness + operational signals. Reports whether credentials exist, never their values. */
export const GET = route({ permission: "settings:manage", rateLimit: RL.admin }, () => systemHealth());
