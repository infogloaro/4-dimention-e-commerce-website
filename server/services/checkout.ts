import { db, withTransaction, type TxClient } from "../db/client";
import { env } from "../core/env";
import { AppError, notFound } from "../core/errors";
import { logger } from "../core/logger";
import type { AuthUser } from "../auth/session";
import { priceItems, type PriceResponse, type RequestedItem } from "./pricing-service";
import { claimCouponUse, normalizeCode } from "./coupons";
import { reserveStock } from "./inventory";
import { cancelInTx, finalizePlacement, loadOrder, newOrderNumber, toOrderView, addHistory, addTrackingEvent } from "./orders-core";
import { initiateOnlinePayment, type PaymentInit } from "./payments";
import { getCheckoutCart } from "./cart";
import { notify } from "./notifications";
import { audit } from "./audit";
import type { Prisma } from "../db/generated/client";

export interface CheckoutInput {
  addressId: string;
  billingAddressId?: string;
  shippingMethod?: string;
  paymentMethod?: "COD" | "ONLINE";
  notes?: string;
  expectedTotal?: number;
  items?: Array<{ variantId: string; quantity: number }>;
  couponCodes?: string[];
}

async function loadAddress(tx: TxClient | typeof db, userId: string, id: string) {
  const a = await tx.address.findFirst({ where: { id, userId, deletedAt: null } });
  if (!a) throw notFound("ADDRESS_NOT_FOUND", "Address");
  return a;
}

async function resolveItems(userId: string, input: CheckoutInput) {
  if (input.items?.length) return { source: "items" as const, items: input.items as RequestedItem[], couponCodes: input.couponCodes ?? [] };
  const cart = await getCheckoutCart(userId);
  return { source: "cart" as const, items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), couponCodes: input.couponCodes ?? cart.couponCodes };
}

/** Throw the most relevant business error for a priced basket that cannot be bought as-is. */
function assertPurchasable(priced: PriceResponse, expectedTotal?: number) {
  if (priced.items.length === 0) throw new AppError("CART_EMPTY", "Your cart is empty");
  for (const it of priced.items) {
    if (it.purchasable) continue;
    const issue = it.issues.find((i) => i.code !== "PRICE_CHANGED")!;
    const code = issue.code === "UNAVAILABLE" ? "ITEM_UNAVAILABLE" : issue.code === "OUT_OF_STOCK" ? "OUT_OF_STOCK" : issue.code === "MAX_QUANTITY" ? "MAX_QUANTITY_EXCEEDED" : "INSUFFICIENT_STOCK";
    throw new AppError(code, `${it.name}: ${issue.message}`, { variantId: it.variantId, name: it.name, available: it.availability.available, requested: it.quantity });
  }
  if (!priced.shipping.selected) throw new AppError("SHIPPING_UNAVAILABLE", "We can't deliver to this address with the selected option", { available: priced.shipping.options.map((o) => o.code) });
  if (priced.couponFailures.length) {
    const f = priced.couponFailures[0]!;
    throw new AppError(f.errorCode, f.message, { code: f.code });
  }
  if (expectedTotal != null && expectedTotal !== priced.pricing.grandTotal) {
    throw new AppError("PRICE_CHANGED", "Prices or discounts changed since you last viewed your order", { expectedTotal, actualTotal: priced.pricing.grandTotal });
  }
}

/** Dry run: everything checkout would compute, without creating or reserving anything. */
export async function validateCheckout(user: AuthUser, input: CheckoutInput) {
  const address = await loadAddress(db, user.id, input.addressId);
  const { items, couponCodes } = await resolveItems(user.id, input);
  const priced = await priceItems({ items, couponCodes, userId: user.id, address: { postalCode: address.postalCode, state: address.state, country: address.country }, shippingMethod: input.shippingMethod });
  const blocking = priced.items.filter((i) => !i.purchasable).length > 0 || priced.items.length === 0 || !priced.shipping.selected;
  return {
    valid: !blocking && priced.couponFailures.length === 0,
    address: { id: address.id, fullName: address.fullName, city: address.city, state: address.state, postalCode: address.postalCode },
    items: priced.items,
    pricing: priced.pricing,
    shipping: priced.shipping,
    coupons: { applied: priced.pricing.appliedCoupons, rejected: priced.couponFailures },
    issues: priced.issues,
    paymentMethods: [
      { code: "ONLINE", provider: env.PAYMENT_PROVIDER, available: true },
      { code: "COD", available: priced.pricing.grandTotal <= 5_000_000, note: priced.pricing.grandTotal > 5_000_000 ? "Cash on delivery isn't available for orders above 50,000" : undefined },
    ],
    reservationMinutes: env.STOCK_RESERVATION_MINUTES,
  };
}

export interface CheckoutResult {
  order: ReturnType<typeof toOrderView>;
  payment: PaymentInit | null;
  nextAction: "ORDER_CONFIRMED" | "COMPLETE_PAYMENT";
  reservationExpiresAt: Date | null;
}

/**
 * Turn a basket into an order. One DB transaction does: per-user serialisation, price & stock validation,
 * order + item snapshots, stock reservation, coupon claim — all-or-nothing. Callers wrap it in withIdempotency().
 */
export async function createCheckout(user: AuthUser, input: CheckoutInput): Promise<CheckoutResult> {
  if (!input.paymentMethod) throw new AppError("BAD_REQUEST", "paymentMethod is required");
  const method = input.paymentMethod;
  const { source, items, couponCodes } = await resolveItems(user.id, input);

  const orderId = await withTransaction(async (tx) => {
    // serialise checkouts of the same customer (per-user coupon limits, superseding stale attempts)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${user.id}`}))`;

    const address = await loadAddress(tx, user.id, input.addressId);
    const billing = input.billingAddressId ? await loadAddress(tx, user.id, input.billingAddressId) : address;

    const stale = await tx.order.findMany({ where: { userId: user.id, status: "PENDING_PAYMENT", payments: { none: { status: "CAPTURED" } } }, select: { id: true } });
    for (const s of stale) await cancelInTx(tx, s.id, { reason: "Superseded by a new checkout", allowed: ["PENDING_PAYMENT"] });

    const priced = await priceItems({ items, couponCodes, userId: user.id, address: { postalCode: address.postalCode, state: address.state, country: address.country }, shippingMethod: input.shippingMethod }, tx);
    assertPurchasable(priced, input.expectedTotal);
    if (method === "COD" && priced.pricing.grandTotal > 5_000_000) throw new AppError("BAD_REQUEST", "Cash on delivery isn't available for orders above 50,000");

    const { pricing, shipping } = priced;
    const sel = shipping.selected!;
    const lineByKey = new Map(pricing.lines.map((l) => [l.key, l]));
    const expiresAt = new Date(Date.now() + env.STOCK_RESERVATION_MINUTES * 60_000);
    const addrSnap = (a: typeof address) => ({ id: a.id, fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, postalCode: a.postalCode, country: a.country, type: a.type });

    let order;
    for (let attempt = 0; ; attempt++) {
      try {
        order = await tx.order.create({
          data: {
            orderNumber: newOrderNumber(),
            userId: user.id,
            status: "PENDING_PAYMENT",
            paymentStatus: "UNPAID",
            currency: env.STORE_CURRENCY,
            subtotal: pricing.subtotal,
            discountTotal: pricing.couponDiscount,
            shippingTotal: pricing.shippingTotal,
            taxTotal: pricing.taxTotal,
            grandTotal: pricing.grandTotal,
            pricesIncludeTax: pricing.pricesIncludeTax,
            couponCodes: pricing.appliedCoupons.map((c) => c.code),
            couponSnapshot: pricing.appliedCoupons as unknown as Prisma.InputJsonValue,
            shippingMethodCode: sel.code,
            shippingSnapshot: { code: sel.code, name: sel.name, carrier: sel.carrier, fee: pricing.shippingFee, discount: pricing.shippingDiscount, total: pricing.shippingTotal, minDays: sel.minDays, maxDays: sel.maxDays, zone: sel.zone },
            shippingAddress: addrSnap(address),
            billingAddress: addrSnap(billing),
            customerEmail: user.email,
            customerName: user.name,
            customerPhone: address.phone,
            notes: input.notes,
            pricingSnapshot: pricing as unknown as Prisma.InputJsonValue,
            estimatedDeliveryMin: new Date(sel.estimatedDelivery.earliest),
            estimatedDeliveryMax: new Date(sel.estimatedDelivery.latest),
            reservationExpiresAt: expiresAt,
            items: {
              create: priced.items.map((it) => {
                const l = lineByKey.get(it.variantId)!;
                return {
                  productId: it.productId,
                  variantId: it.variantId,
                  sku: it.sku,
                  name: it.name,
                  variantName: it.variantName,
                  imageUrl: it.image,
                  brandName: it.brand,
                  categoryName: it.category,
                  attributes: it.options,
                  productSnapshot: { productId: it.productId, slug: it.slug, name: it.name, brand: it.brand, category: it.category, sku: it.sku, options: it.options, weightGrams: it.weightGrams },
                  unitPrice: l.unitPrice,
                  compareAtPrice: l.compareAtPrice,
                  quantity: l.quantity,
                  discountAmount: l.discount,
                  taxRateBps: l.taxRateBps,
                  taxAmount: l.tax,
                  lineTotal: l.total,
                };
              }),
            },
          },
        });
        break;
      } catch (e) {
        if ((e as { code?: string }).code === "P2002" && attempt < 4) continue; // order-number collision
        throw e;
      }
    }

    await addHistory(tx, order.id, null, "PENDING_PAYMENT", user.id, "Checkout created");
    await addTrackingEvent(tx, order.id, { code: "ORDER_CREATED", title: "Order created", description: method === "ONLINE" ? "Waiting for your payment." : "Your order is being confirmed." });
    await reserveStock(tx, order.id, pricing.lines.map((l) => ({ variantId: l.key, quantity: l.quantity })), expiresAt, user.id);

    // coupons: claim atomically against global limits, record per-user redemption
    for (const applied of pricing.appliedCoupons) {
      const c = await tx.coupon.findUniqueOrThrow({ where: { code: normalizeCode(applied.code) }, select: { id: true } });
      if (!(await claimCouponUse(tx, c.id))) throw new AppError("COUPON_USAGE_LIMIT", "This coupon has just reached its usage limit", { code: applied.code });
      await tx.couponRedemption.create({ data: { couponId: c.id, userId: user.id, orderId: order.id, discountAmount: applied.discount + applied.shippingDiscount } });
    }

    if (method === "COD" || pricing.grandTotal === 0) {
      await tx.payment.create({ data: { orderId: order.id, provider: "COD", method: method === "COD" ? "cod" : "free", status: pricing.grandTotal === 0 ? "CAPTURED" : "CREATED", amount: pricing.grandTotal, currency: env.STORE_CURRENCY, idempotencyKey: `cod:${order.id}`, ...(pricing.grandTotal === 0 ? { paidAt: new Date() } : {}) } });
      await finalizePlacement(tx, order.id, { paid: pricing.grandTotal === 0, actorId: user.id });
    }
    await audit({ action: "order.created", resourceType: "order", resourceId: order.id, actor: user, metadata: { source, method, total: pricing.grandTotal } }, tx);
    return order.id;
  }, { timeoutMs: 30_000 });

  // ── outside the transaction ──
  let order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  let payment: PaymentInit | null = null;

  if (order.status === "PENDING_PAYMENT") {
    try {
      payment = await initiateOnlinePayment(order);
    } catch (e) {
      logger.error("payment initiation failed; rolling the order back", { orderId, error: e instanceof Error ? e.message : String(e) });
      await withTransaction((tx) => cancelInTx(tx, orderId, { reason: "Could not start payment", actorId: user.id }));
      throw e instanceof AppError ? e : new AppError("PAYMENT_PROVIDER_UNAVAILABLE", "We couldn't start the payment. Please try again.");
    }
    order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  } else {
    await notify("order.placed", { userId: user.id, email: user.email, phone: order.customerPhone }, { orderNumber: order.orderNumber, total: order.grandTotal });
  }

  return {
    order: toOrderView(await loadOrder({ id: orderId })),
    payment,
    nextAction: order.status === "PENDING_PAYMENT" ? "COMPLETE_PAYMENT" : "ORDER_CONFIRMED",
    reservationExpiresAt: order.reservationExpiresAt,
  };
}
