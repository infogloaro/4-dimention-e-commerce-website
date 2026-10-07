import { route, noContent } from "@/server/core/http";
import { logout } from "@/server/services/auth";
import { clearSessionCookie } from "@/server/core/session-cookie";

export const POST = route({ auth: "optional" }, async (ctx) => {
  if (ctx.user) await logout(ctx.user);
  clearSessionCookie(ctx);
  return noContent();
});
