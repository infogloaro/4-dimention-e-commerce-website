import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { lowStock } from "@/server/services/inventory";

export const GET = route({ permission: "inventory:read", rateLimit: RL.admin }, () => lowStock(100));
