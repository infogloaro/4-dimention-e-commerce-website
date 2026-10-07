import { route } from "@/server/core/http";
import { listSessions } from "@/server/services/auth";

export const GET = route({ auth: "required" }, (ctx) => listSessions(ctx.requireUser()));
