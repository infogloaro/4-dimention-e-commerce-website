import { route, reply } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { assertIdempotencyKey, hashRequest, withIdempotency } from "@/server/core/idempotency";
import { checkoutBody } from "@/server/validation/commerce";
import { createCheckout } from "@/server/services/checkout";
import type { Prisma } from "@/server/db/generated/client";

/**
 * Creates the order (reserving stock) and, for ONLINE payments, the payment attempt.
 * Requires an `Idempotency-Key` header: retrying with the same key never creates a second order.
 */
export const POST = route({ auth: "required", body: checkoutBody, rateLimit: RL.checkout }, async (ctx) => {
  const user = ctx.requireUser();
  const key = assertIdempotencyKey(ctx.req.headers.get("idempotency-key"));
  const out = await withIdempotency<Prisma.InputJsonValue>({ scope: "checkout", actorKey: user.id, key, requestHash: hashRequest(ctx.body) }, async () => {
    const result = await createCheckout(user, ctx.body);
    return { status: 201, body: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue };
  });
  return reply(out.body, { status: out.status, headers: out.replayed ? { "Idempotent-Replay": "true" } : undefined });
});
