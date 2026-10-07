import { describe, expect, it } from "vitest";
import { allocate, calculatePricing, describePrice, lineTax, type CouponRule, type PricingLineInput } from "@/server/domain/pricing";

const line = (over: Partial<PricingLineInput> = {}): PricingLineInput => ({ key: "v1", productId: "p1", categoryIds: ["c1"], unitPrice: 10_000, compareAtPrice: 12_000, quantity: 1, taxRateBps: 1800, ...over });
const coupon = (over: Partial<CouponRule> = {}): CouponRule => ({ code: "X", type: "PERCENTAGE", value: 10, minSubtotal: 0, maxDiscount: null, isStackable: false, productIds: [], categoryIds: [], ...over });

describe("allocate", () => {
  it("splits exactly, never losing a paisa", () => {
    for (const total of [1, 7, 100, 999, 12_345]) {
      const parts = allocate(total, [3333, 3333, 3334]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it("handles zero weights and totals", () => {
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(10, [0, 0])).toEqual([0, 0]);
  });
});

describe("tax", () => {
  it("extracts tax from an inclusive price", () => {
    expect(lineTax(11_800, 1800, true)).toBe(1800);
  });
  it("adds tax on an exclusive price", () => {
    expect(lineTax(10_000, 1800, false)).toBe(1800);
  });
  it("is zero for zero-rated or free lines", () => {
    expect(lineTax(5000, 0, true)).toBe(0);
    expect(lineTax(0, 1800, true)).toBe(0);
  });
});

describe("calculatePricing", () => {
  it("prices a simple basket (tax inclusive)", () => {
    const r = calculatePricing({ lines: [line({ quantity: 2 })], pricesIncludeTax: true });
    expect(r.subtotal).toBe(20_000);
    expect(r.mrpTotal).toBe(24_000);
    expect(r.mrpSavings).toBe(4_000);
    expect(r.grandTotal).toBe(20_000);
    expect(r.taxTotal).toBe(Math.round((20_000 * 1800) / 11_800));
  });

  it("adds tax on top when prices are tax-exclusive", () => {
    const r = calculatePricing({ lines: [line()], pricesIncludeTax: false });
    expect(r.taxTotal).toBe(1800);
    expect(r.grandTotal).toBe(11_800);
  });

  it("applies percentage coupons with a maximum cap", () => {
    const r = calculatePricing({ lines: [line({ unitPrice: 100_000 })], coupons: [coupon({ value: 20, maxDiscount: 5_000 })], pricesIncludeTax: true });
    expect(r.couponDiscount).toBe(5_000);
    expect(r.grandTotal).toBe(95_000);
  });

  it("never lets a fixed coupon exceed the eligible amount", () => {
    const r = calculatePricing({ lines: [line({ unitPrice: 3_000 })], coupons: [coupon({ type: "FIXED_AMOUNT", value: 50_000 })], pricesIncludeTax: true });
    expect(r.couponDiscount).toBe(3_000);
    expect(r.grandTotal).toBe(0);
  });

  it("rejects a coupon below its minimum subtotal", () => {
    const r = calculatePricing({ lines: [line()], coupons: [coupon({ minSubtotal: 50_000 })], pricesIncludeTax: true });
    expect(r.couponDiscount).toBe(0);
    expect(r.rejectedCoupons[0]?.reason).toBe("COUPON_MIN_SUBTOTAL");
  });

  it("scopes product- and category-specific coupons to matching lines only", () => {
    const lines = [line({ key: "a", productId: "pA", categoryIds: ["audio"], unitPrice: 10_000 }), line({ key: "b", productId: "pB", categoryIds: ["fashion"], unitPrice: 10_000 })];
    const byCategory = calculatePricing({ lines, coupons: [coupon({ categoryIds: ["audio"], value: 50 })], pricesIncludeTax: true });
    expect(byCategory.lines.find((l) => l.key === "a")!.discount).toBe(5_000);
    expect(byCategory.lines.find((l) => l.key === "b")!.discount).toBe(0);
    const byProduct = calculatePricing({ lines, coupons: [coupon({ productIds: ["pB"], value: 10 })], pricesIncludeTax: true });
    expect(byProduct.couponDiscount).toBe(1_000);
    const none = calculatePricing({ lines, coupons: [coupon({ productIds: ["zzz"] })], pricesIncludeTax: true });
    expect(none.rejectedCoupons[0]?.reason).toBe("COUPON_NOT_APPLICABLE");
  });

  it("allocates the discount so line discounts sum exactly to the total", () => {
    const lines = [line({ key: "a", unitPrice: 3_333 }), line({ key: "b", productId: "p2", unitPrice: 3_333 }), line({ key: "c", productId: "p3", unitPrice: 3_334 })];
    const r = calculatePricing({ lines, coupons: [coupon({ type: "FIXED_AMOUNT", value: 1_001 })], pricesIncludeTax: true });
    expect(r.lines.reduce((s, l) => s + l.discount, 0)).toBe(1_001);
    expect(r.grandTotal).toBe(10_000 - 1_001);
  });

  it("only stacks coupons when every coupon is stackable", () => {
    const base = { lines: [line({ unitPrice: 100_000 })], pricesIncludeTax: true };
    const bothStackable = calculatePricing({ ...base, coupons: [coupon({ code: "A", isStackable: true, value: 10 }), coupon({ code: "B", isStackable: true, value: 10 })] });
    expect(bothStackable.appliedCoupons.map((c) => c.code)).toEqual(["A", "B"]);
    expect(bothStackable.couponDiscount).toBe(10_000 + 9_000); // second applies on the remaining amount
    const oneNot = calculatePricing({ ...base, coupons: [coupon({ code: "A", isStackable: false }), coupon({ code: "B", isStackable: true })] });
    expect(oneNot.appliedCoupons.map((c) => c.code)).toEqual(["A"]);
    expect(oneNot.rejectedCoupons[0]?.reason).toBe("COUPON_NOT_STACKABLE");
  });

  it("charges shipping, waives it above the threshold and via FREE_SHIPPING coupons", () => {
    const base = { lines: [line({ unitPrice: 30_000 })], pricesIncludeTax: true };
    const paid = calculatePricing({ ...base, shipping: { fee: 4_900, freeAboveSubtotal: 99_900 } });
    expect(paid.shippingTotal).toBe(4_900);
    expect(paid.grandTotal).toBe(34_900);
    expect(paid.freeShippingRemaining).toBe(99_900 - 30_000);
    const free = calculatePricing({ ...base, lines: [line({ unitPrice: 120_000 })], shipping: { fee: 4_900, freeAboveSubtotal: 99_900 } });
    expect(free.shippingTotal).toBe(0);
    const viaCoupon = calculatePricing({ ...base, coupons: [coupon({ type: "FREE_SHIPPING", value: 0 })], shipping: { fee: 4_900, freeAboveSubtotal: null } });
    expect(viaCoupon.shippingTotal).toBe(0);
    expect(viaCoupon.appliedCoupons[0]?.shippingDiscount).toBe(4_900);
  });

  it("computes the free-shipping threshold on the discounted subtotal", () => {
    const r = calculatePricing({ lines: [line({ unitPrice: 100_000 })], coupons: [coupon({ value: 20 })], shipping: { fee: 4_900, freeAboveSubtotal: 99_900 }, pricesIncludeTax: true });
    expect(r.discountedSubtotal).toBe(80_000);
    expect(r.shippingTotal).toBe(4_900);
  });

  it("returns an empty, zero total for an empty basket", () => {
    const r = calculatePricing({ lines: [], shipping: { fee: 4_900, freeAboveSubtotal: null }, pricesIncludeTax: true });
    expect(r.grandTotal).toBe(0);
    expect(r.shippingFee).toBe(0);
  });

  it("grand total always equals payable lines + shipping", () => {
    const r = calculatePricing({ lines: [line({ unitPrice: 7_777, quantity: 3 }), line({ key: "b", productId: "p2", unitPrice: 1_234, taxRateBps: 500 })], coupons: [coupon({ value: 15 })], shipping: { fee: 3_000, freeAboveSubtotal: null }, pricesIncludeTax: false });
    expect(r.grandTotal).toBe(r.lines.reduce((s, l) => s + l.total, 0) + r.shippingTotal);
  });
});

describe("describePrice", () => {
  it("reports discount percent only when MRP exceeds price", () => {
    expect(describePrice(8_000, 10_000)).toMatchObject({ onSale: true, discountPercent: 20, discountAmount: 2_000 });
    expect(describePrice(10_000, 10_000)).toMatchObject({ onSale: false, discountPercent: 0, compareAtPrice: null });
    expect(describePrice(10_000, null).onSale).toBe(false);
  });
});
