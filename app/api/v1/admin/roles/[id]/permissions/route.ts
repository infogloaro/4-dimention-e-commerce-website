import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { rolePermissionsBody } from "@/server/validation/admin";
import { setRolePermissions } from "@/server/services/admin-ops";

/** Replace a role's permission set. Super-admin only (`role:manage`). Audited with before/after. */
export const PUT = route({ permission: "role:manage", params: idParams, body: rolePermissionsBody, rateLimit: RL.admin }, (ctx) => setRolePermissions(ctx.requireUser(), ctx.params.id, ctx.body.permissions));
