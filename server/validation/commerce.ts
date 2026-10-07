import { z } from "zod";
import { countryCode, id, phone, plainText, postalCode, quantity } from "./common";

// ── cart ──
export const addCartItemBody = z.object({ variantId: id, quantity: quantity.default(1) });
export const updateCartItemBody = z
  .object({ quantity: z.number().int().min(0).max(100).optional(), savedForLater: z.boolean().optional() })
  .refine((v) => v.quantity !== undefined || v.savedForLater !== undefined, "Provide quantity or savedForLater");
export const couponBody = z.object({ code: z.string().trim().min(2).max(40) });
export const cartQuery = z.object({ addressId: id.optional(), postalCode: postalCode.optional(), state: z.string().max(80).optional(), shippingMethod: z.string().max(40).optional() });

// ── addresses ──
export const addressBody = z.object({
  fullName: plainText(100, 2),
  phone,
  line1: plainText(200, 3),
  line2: plainText(200).optional(),
  landmark: plainText(120).optional(),
  city: plainText(80, 2),
  state: plainText(80, 2),
  postalCode,
  country: countryCode.default("IN"),
  type: z.enum(["HOME", "WORK", "OTHER"]).default("HOME"),
  isDefault: z.boolean().default(false),
});
export const updateAddressBody = addressBody.partial();

// ── wishlist ──
export const wishlistAddBody = z.object({ productId: id, variantId: id.optional() });

// ── shipping ──
export const shippingEstimateQuery = z.object({ postalCode: postalCode, state: z.string().max(80).optional(), country: countryCode.optional(), subtotal: z.coerce.number().int().min(0).default(0), weightGrams: z.coerce.number().int().min(0).default(500) });

// ── checkout ──
export const checkoutBody = z.object({
  addressId: id,
  billingAddressId: id.optional(),
  shippingMethod: z.string().max(40).optional(),
  paymentMethod: z.enum(["COD", "ONLINE"]),
  notes: plainText(500).optional(),
  /** Only variants/quantities the client believes it is buying — used as an optimistic-concurrency check. */
  expectedTotal: z.number().int().min(0).optional(),
  /** Buy-now: purchase these items instead of the cart. */
  items: z.array(z.object({ variantId: id, quantity })).min(1).max(20).optional(),
  couponCodes: z.array(z.string().trim().max(40)).max(3).optional(),
});
export const checkoutValidateBody = checkoutBody.partial({ paymentMethod: true });

export const confirmPaymentBody = z.object({
  paymentId: id,
  /** Provider-specific proof returned by the client SDK (signature, payment_intent, ...). Verified server-side. */
  providerPayload: z.record(z.string(), z.unknown()).default({}),
});
