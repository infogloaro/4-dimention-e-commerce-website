import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { staffBody } from "@/server/validation/admin";
import { createStaff, listStaff } from "@/server/services/admin-ops";

/** Staff accounts (anyone whose role is a staff role). */
export const GET = route({ permission: "user:manage", rateLimit: RL.admin }, () => listStaff());
export const POST = route({ permission: "user:manage", body: staffBody, rateLimit: RL.admin }, async (ctx) => created(await createStaff(ctx.requireUser(), ctx.body)));
