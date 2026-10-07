import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { settingBody, settingKeyParams } from "@/server/validation/admin";
import { putSetting } from "@/server/services/admin-ops";

export const PUT = route({ permission: "settings:manage", params: settingKeyParams, body: settingBody, rateLimit: RL.admin }, (ctx) => putSetting(ctx.requireUser(), ctx.params.key, ctx.body.value as never, ctx.body.isPublic));
