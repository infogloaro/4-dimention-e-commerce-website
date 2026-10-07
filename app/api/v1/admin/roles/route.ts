import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { listRoles, permissionCatalogue } from "@/server/services/admin-ops";

export const GET = route({ permission: ["user:manage", "role:manage"], permissionMode: "any", rateLimit: RL.admin }, async () => ({ roles: await listRoles(), permissions: permissionCatalogue() }));
