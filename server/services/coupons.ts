import { db, type Db } from "../db/client";
import { AppError, type ErrorCode } from "../core/errors";
import type { CouponRule } from "../domain/pricing";

export const normalizeCode = (c: string) => c.trim().toUpperCase();

export interface CouponCheckFailure {
  code: string;
  errorCode: ErrorCode;
  message: string;
}

/**
 * Validate coupons that depend on *who* is buying and *when* (dates, usage limits, per-user limits, first-order,
 * user-restricted). Cart-dependent checks (min subtotal, product/category scope, stacking) happen in the pricing engine.
 */
export async function resolveCoupons(codes: string[], ctx: { userId?: string | null; now?: Date }, client: Db = db) {
  const now = ctx.now ?? new Date();
  const wanted = [...new Set(codes.map(normalizeCode))].slice(0, 5);
  const rows = wanted.length
    ? await client.coupon.findMany({ where: { code: { in: wanted } }, include: { products: { select: { productId: true } }, categories: { select: { categoryId: true } } } })
    : [];
  const byCode = new Map(rows.map((r) => [r.code, r]));

  const userUsage = ctx.userId && rows.length
    ? await client.couponRedemption.groupBy({ by: ["couponId"], where: { userId: ctx.userId, releasedAt: null, couponId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
    : [];
  const usageMap = new Map(userUsage.map((u) => [u.couponId, u._count._all]));
  const priorOrders = ctx.userId && rows.some((r) => r.firstOrderOnly)
    ? await client.order.count({ where: { userId: ctx.userId, status: { notIn: ["CANCELLED", "FAILED", "PENDING_PAYMENT"] } } })
    : 0;

  const rules: CouponRule[] = [];
  const failures: CouponCheckFailure[] = [];
  const fail = (code: string, errorCode: ErrorCode, message: string) => failures.push({ code, errorCode, message });

  for (const code of wanted) {
    const c = byCode.get(code);
    if (!c || !c.isActive) {
      fail(code, c ? "COUPON_INVALID" : "COUPON_NOT_FOUND", c ? "This coupon is not active" : "This coupon code doesn't exist");
      continue;
    }
    if (c.startsAt && c.startsAt > now) { fail(code, "COUPON_NOT_STARTED", "This coupon isn't active yet"); continue; }
    if (c.endsAt && c.endsAt <= now) { fail(code, "COUPON_EXPIRED", "This coupon has expired"); continue; }
    if (c.usageLimit != null && c.usedCount >= c.usageLimit) { fail(code, "COUPON_USAGE_LIMIT", "This coupon has reached its usage limit"); continue; }
    const needsUser = c.restrictedToUserId || c.firstOrderOnly || c.perUserLimit != null;
    if (needsUser && !ctx.userId) { fail(code, "COUPON_INVALID", "Sign in to use this coupon"); continue; }
    if (c.restrictedToUserId && c.restrictedToUserId !== ctx.userId) { fail(code, "COUPON_INVALID", "This coupon isn't available for your account"); continue; }
    if (c.firstOrderOnly && priorOrders > 0) { fail(code, "COUPON_FIRST_ORDER_ONLY", "This coupon is valid on your first order only"); continue; }
    if (c.perUserLimit != null && (usageMap.get(c.id) ?? 0) >= c.perUserLimit) { fail(code, "COUPON_USAGE_LIMIT", "You've already used this coupon the maximum number of times"); continue; }
    rules.push({
      code: c.code,
      type: c.type,
      value: c.value,
      minSubtotal: c.minSubtotal,
      maxDiscount: c.maxDiscount,
      isStackable: c.isStackable,
      productIds: c.products.map((p) => p.productId),
      categoryIds: c.categories.map((x) => x.categoryId),
    });
  }
  return { rules, failures, ids: new Map(rows.map((r) => [r.code, r.id])) };
}

export function throwFirstFailure(failures: CouponCheckFailure[]): never {
  const f = failures[0]!;
  throw new AppError(f.errorCode, f.message, { code: f.code });
}

/** Atomically claim one use of a coupon (respecting the global limit). Returns false if exhausted. */
export async function claimCouponUse(tx: Db, couponId: string): Promise<boolean> {
  const n = await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE id = ${couponId} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
  return n === 1;
}

export async function releaseCouponUse(tx: Db, orderId: string) {
  const reds = await tx.couponRedemption.findMany({ where: { orderId, releasedAt: null } });
  for (const r of reds) {
    await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE id = ${r.couponId}`;
    await tx.couponRedemption.update({ where: { id: r.id }, data: { releasedAt: new Date() } });
  }
}
