import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { updateCouponBody } from "@/server/validation/admin";
import { couponAnalytics, deleteCoupon, updateCoupon } from "@/server/services/admin-ops";

/** Coupon + usage analytics (uses, total discount, revenue influenced, unique users, recent redemptions). */
export const GET = route({ permission: "coupon:read", params: idParams, rateLimit: RL.admin }, (ctx) => couponAnalytics(ctx.params.id));
/** Also the activate / deactivate switch: PATCH { isActive }. */
export const PATCH = route({ permission: "coupon:write", params: idParams, body: updateCouponBody, rateLimit: RL.admin }, (ctx) => updateCoupon(ctx.requireUser(), ctx.params.id, ctx.body));
export const DELETE = route({ permission: "coupon:write", params: idParams, rateLimit: RL.admin }, (ctx) => deleteCoupon(ctx.requireUser(), ctx.params.id));
