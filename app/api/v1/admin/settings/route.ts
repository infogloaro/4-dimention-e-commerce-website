import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { listSettings } from "@/server/services/admin-ops";

export const GET = route({ permission: "settings:manage", rateLimit: RL.admin }, () => listSettings());
