import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { AppError } from "@/server/core/errors";
import { safeEqual } from "@/server/core/crypto";
import { expireStaleReservations } from "@/server/services/inventory";
import { refreshDailyStats } from "@/server/services/analytics";
import { db } from "@/server/db/client";

/**
 * Scheduler hook (EventBridge / cron / Vercel Cron): expires unpaid reservations, refreshes yesterday+today analytics,
 * purges expired sessions/tokens/idempotency records. Authenticated with `Authorization: Bearer $JOBS_TOKEN` (min 24 chars; endpoint is disabled when unset).
 */
export const POST = route({ csrf: false, rateLimit: RL.sensitive }, async (ctx) => {
  const given = ctx.req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = process.env.JOBS_TOKEN ?? "";
  if (!expected || expected.length < 24 || !safeEqual(given, expected)) throw new AppError("FORBIDDEN", "Invalid jobs token");
  const now = new Date();
  const released = await expireStaleReservations(now);
  await refreshDailyStats(new Date(now.getTime() - 86_400_000), now);
  const [sessions, tokens, keys] = await Promise.all([
    db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } }] } }),
    db.verificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { reservationsReleased: released.released, purged: { sessions: sessions.count, tokens: tokens.count, idempotencyKeys: keys.count } };
});
