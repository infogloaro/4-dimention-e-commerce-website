import { db } from "../db/client";
import { AppError } from "./errors";
import { sha256 } from "./crypto";
import type { Prisma } from "../db/generated/client";

const TTL_MS = 24 * 3_600_000;
const STALE_IN_PROGRESS_MS = 2 * 60_000;

export const hashRequest = (body: unknown) => sha256(JSON.stringify(body ?? null));

export function assertIdempotencyKey(key: string | null): string {
  if (!key || !/^[A-Za-z0-9_\-:.]{8,128}$/.test(key)) {
    throw new AppError("BAD_REQUEST", "An Idempotency-Key header (8-128 chars: letters, digits, _ - : .) is required");
  }
  return key;
}

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

/**
 * Run `fn` at most once per (scope, actor, key).
 *  - same key + same payload, finished  → the stored response is replayed (no side effects)
 *  - same key + same payload, running   → 409 REQUEST_IN_PROGRESS
 *  - same key + different payload       → 422 IDEMPOTENCY_KEY_REUSED
 *  - fn throws                          → record removed so the client can safely retry
 * The unique index on (scope, actorKey, key) arbitrates concurrent first attempts.
 */
export async function withIdempotency<T extends Prisma.InputJsonValue>(
  opts: { scope: string; actorKey: string; key: string; requestHash: string },
  fn: () => Promise<{ status: number; body: T }>,
): Promise<IdempotentResult<T>> {
  const where = { scope_actorKey_key: { scope: opts.scope, actorKey: opts.actorKey, key: opts.key } };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.idempotencyRecord.create({ data: { scope: opts.scope, actorKey: opts.actorKey, key: opts.key, requestHash: opts.requestHash, expiresAt: new Date(Date.now() + TTL_MS) } });
      break;
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      const rec = await db.idempotencyRecord.findUnique({ where });
      if (!rec) continue; // deleted between create and read → retry
      if (rec.expiresAt <= new Date() || (rec.status === "IN_PROGRESS" && Date.now() - rec.createdAt.getTime() > STALE_IN_PROGRESS_MS)) {
        await db.idempotencyRecord.deleteMany({ where: { id: rec.id } });
        continue;
      }
      if (rec.requestHash !== opts.requestHash) throw new AppError("IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used with a different request");
      if (rec.status === "COMPLETED") return { status: rec.responseCode ?? 200, body: rec.response as unknown as T, replayed: true };
      throw new AppError("REQUEST_IN_PROGRESS", "A request with this Idempotency-Key is still being processed");
    }
    if (attempt === 2) throw new AppError("REQUEST_IN_PROGRESS", "Could not acquire the idempotency lock");
  }

  try {
    const out = await fn();
    await db.idempotencyRecord.update({ where, data: { status: "COMPLETED", responseCode: out.status, response: out.body } });
    return { ...out, replayed: false };
  } catch (e) {
    await db.idempotencyRecord.deleteMany({ where: { scope: opts.scope, actorKey: opts.actorKey, key: opts.key } }).catch(() => undefined);
    throw e;
  }
}
