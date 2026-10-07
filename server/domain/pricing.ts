/**
 * Pricing engine — PURE functions, no I/O.
 * One implementation is shared by product pages, cart, checkout, order creation and admin previews so that
 * a price can never be computed two different ways. All amounts are integer minor units.
 */

export type CouponKind = "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";

export interface PricingLineInput {
  /** Stable key (variant id). */
  key: string;
  productId: string;
  /** Product's category id plus all ancestor ids — lets category coupons cover subcategories. */
  categoryIds: string[];
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  taxRateBps: number;
  weightGrams?: number;
}

export interface CouponRule {
  code: string;
  type: CouponKind;
  /** percent (1-100) for PERCENTAGE, minor units for FIXED_AMOUNT */
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  isStackable: boolean;
  /** Empty arrays mean "no restriction". A line qualifies if it matches ANY product OR category restriction. */
  productIds: string[];
  categoryIds: string[];
}

export interface ShippingInput {
  fee: number;
  /** Order value (after discounts) at which shipping becomes free. */
  freeAboveSubtotal: number | null;
}

export interface PricingInput {
  lines: PricingLineInput[];
  coupons?: CouponRule[];
  shipping?: ShippingInput | null;
  pricesIncludeTax: boolean;
}

export interface PricedLine {
  key: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  compareAtPrice: number | null;
  /** unitPrice × quantity */
  subtotal: number;
  /** (compareAt ?? unit) × quantity */
  mrpTotal: number;
  /** MRP savings on this line (before coupons) */
  savings: number;
  discount: number;
  /** subtotal − discount (tax-inclusive when pricesIncludeTax) */
  net: number;
  taxRateBps: number;
  tax: number;
  /** amount payable for the line: net (+ tax when exclusive) */
  total: number;
}

export type CouponRejectionCode = "COUPON_MIN_SUBTOTAL" | "COUPON_NOT_APPLICABLE" | "COUPON_NOT_STACKABLE";

export interface AppliedCoupon {
  code: string;
  type: CouponKind;
  /** amount taken off the items */
  discount: number;
  /** shipping waived by this coupon */
  shippingDiscount: number;
}

export interface PricingResult {
  lines: PricedLine[];
  pricesIncludeTax: boolean;
  itemCount: number;
  mrpTotal: number;
  subtotal: number;
  mrpSavings: number;
  couponDiscount: number;
  discountedSubtotal: number;
  shippingFee: number;
  shippingDiscount: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  totalSavings: number;
  freeShippingRemaining: number | null;
  appliedCoupons: AppliedCoupon[];
  rejectedCoupons: Array<{ code: string; reason: CouponRejectionCode; message: string }>;
}

/** Split `total` across `weights` proportionally; remainders go to the largest fractional parts so the parts sum EXACTLY to total. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    parts[i]!++;
    remainder--;
  }
  return parts;
}

export function lineTax(net: number, rateBps: number, pricesIncludeTax: boolean): number {
  if (rateBps <= 0 || net <= 0) return 0;
  return pricesIncludeTax ? Math.round((net * rateBps) / (10_000 + rateBps)) : Math.round((net * rateBps) / 10_000);
}

function eligibleFor(rule: CouponRule, line: PricingLineInput): boolean {
  const scoped = rule.productIds.length > 0 || rule.categoryIds.length > 0;
  if (!scoped) return true;
  return rule.productIds.includes(line.productId) || line.categoryIds.some((c) => rule.categoryIds.includes(c));
}

export function calculatePricing(input: PricingInput): PricingResult {
  const { pricesIncludeTax } = input;
  const lines = input.lines.filter((l) => l.quantity > 0);
  const remaining = lines.map((l) => l.unitPrice * l.quantity); // per-line amount still discountable
  const discounts = lines.map(() => 0);

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const mrpTotal = lines.reduce((s, l) => s + (l.compareAtPrice ?? l.unitPrice) * l.quantity, 0);

  const applied: AppliedCoupon[] = [];
  const rejected: PricingResult["rejectedCoupons"] = [];
  let shippingCouponApplied = false;

  const appliedRules: CouponRule[] = [];
  for (const rule of input.coupons ?? []) {
    // The first coupon always gets its chance; every further one needs ALL coupons (itself included) to be stackable.
    if (appliedRules.length > 0 && !(rule.isStackable && appliedRules.every((r) => r.isStackable))) {
      rejected.push({ code: rule.code, reason: "COUPON_NOT_STACKABLE", message: "This coupon can't be combined with the others applied" });
      continue;
    }
    if (subtotal < rule.minSubtotal) {
      rejected.push({ code: rule.code, reason: "COUPON_MIN_SUBTOTAL", message: `Add items worth ${(rule.minSubtotal - subtotal) / 100} more to use this coupon` });
      continue;
    }
    if (rule.type === "FREE_SHIPPING") {
      applied.push({ code: rule.code, type: rule.type, discount: 0, shippingDiscount: 0 });
      appliedRules.push(rule);
      shippingCouponApplied = true;
      continue;
    }
    const idx = lines.map((l, i) => (eligibleFor(rule, l) && remaining[i]! > 0 ? i : -1)).filter((i) => i >= 0);
    const eligibleTotal = idx.reduce((s, i) => s + remaining[i]!, 0);
    if (idx.length === 0 || eligibleTotal <= 0) {
      rejected.push({ code: rule.code, reason: "COUPON_NOT_APPLICABLE", message: "This coupon doesn't apply to the items in your cart" });
      continue;
    }
    let amount = rule.type === "PERCENTAGE" ? Math.floor((eligibleTotal * rule.value) / 100) : rule.value;
    if (rule.maxDiscount != null) amount = Math.min(amount, rule.maxDiscount);
    amount = Math.max(0, Math.min(amount, eligibleTotal));
    const split = allocate(amount, idx.map((i) => remaining[i]!));
    idx.forEach((lineIdx, k) => {
      remaining[lineIdx]! -= split[k]!;
      discounts[lineIdx]! += split[k]!;
    });
    applied.push({ code: rule.code, type: rule.type, discount: amount, shippingDiscount: 0 });
    appliedRules.push(rule);
  }

  const priced: PricedLine[] = lines.map((l, i) => {
    const lineSubtotal = l.unitPrice * l.quantity;
    const net = lineSubtotal - discounts[i]!;
    const tax = lineTax(net, l.taxRateBps, pricesIncludeTax);
    const lineMrp = (l.compareAtPrice ?? l.unitPrice) * l.quantity;
    return {
      key: l.key,
      productId: l.productId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      compareAtPrice: l.compareAtPrice,
      subtotal: lineSubtotal,
      mrpTotal: lineMrp,
      savings: lineMrp - lineSubtotal,
      discount: discounts[i]!,
      net,
      taxRateBps: l.taxRateBps,
      tax,
      total: pricesIncludeTax ? net : net + tax,
    };
  });

  const couponDiscount = discounts.reduce((a, b) => a + b, 0);
  const discountedSubtotal = subtotal - couponDiscount;
  const taxTotal = priced.reduce((s, l) => s + l.tax, 0);

  // shipping
  const ship = input.shipping ?? null;
  let shippingFee = 0;
  let shippingDiscount = 0;
  let freeShippingRemaining: number | null = null;
  if (ship && lines.length > 0) {
    shippingFee = ship.fee;
    if (ship.freeAboveSubtotal != null) {
      if (discountedSubtotal >= ship.freeAboveSubtotal) shippingDiscount = shippingFee;
      else freeShippingRemaining = ship.freeAboveSubtotal - discountedSubtotal;
    }
    if (shippingCouponApplied) shippingDiscount = shippingFee;
  }
  if (shippingCouponApplied) {
    const a = applied.find((c) => c.type === "FREE_SHIPPING");
    if (a) a.shippingDiscount = shippingFee;
  }
  const shippingTotal = shippingFee - shippingDiscount;

  const itemsPayable = priced.reduce((s, l) => s + l.total, 0);
  const grandTotal = itemsPayable + shippingTotal;

  return {
    lines: priced,
    pricesIncludeTax,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    mrpTotal,
    subtotal,
    mrpSavings: mrpTotal - subtotal,
    couponDiscount,
    discountedSubtotal,
    shippingFee,
    shippingDiscount,
    shippingTotal,
    taxTotal,
    grandTotal,
    totalSavings: mrpTotal - subtotal + couponDiscount + shippingDiscount,
    freeShippingRemaining,
    appliedCoupons: applied,
    rejectedCoupons: rejected,
  };
}

/** Pricing facts for a single product/variant card — same maths, no cart. */
export function describePrice(unitPrice: number, compareAtPrice: number | null) {
  const hasDiscount = compareAtPrice != null && compareAtPrice > unitPrice;
  const discountAmount = hasDiscount ? compareAtPrice - unitPrice : 0;
  return {
    price: unitPrice,
    compareAtPrice: hasDiscount ? compareAtPrice : null,
    discountAmount,
    discountPercent: hasDiscount ? Math.round((discountAmount / compareAtPrice) * 100) : 0,
    onSale: hasDiscount,
  };
}
