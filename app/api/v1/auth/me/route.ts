import { route } from "@/server/core/http";
import { updateProfileBody } from "@/server/validation/auth";
import { toPublicUser, updateProfile } from "@/server/services/auth";
import { loadAuthUserById } from "@/server/auth/session";

export const GET = route({ auth: "required" }, (ctx) => ({ user: toPublicUser(ctx.requireUser()) }));

export const PATCH = route({ auth: "required", body: updateProfileBody }, async (ctx) => {
  const user = ctx.requireUser();
  await updateProfile(user, ctx.body);
  const fresh = await loadAuthUserById(user.id, user.sessionId);
  return { user: toPublicUser(fresh ?? user) };
});
