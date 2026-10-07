import { beforeAll, describe, expect, it } from "vitest";
import { call } from "../support/api";
import { bootstrap, createUser, makeCoupon, makeProduct, PASSWORD, sessionFor, systemActor } from "../support/fixtures";
import { db } from "@/server/db/client";
import { invalidate } from "@/server/core/cache";
import { updateVariant } from "@/server/services/catalog/admin-products";
import * as cart from "@/app/api/v1/cart/route";
import * as cartItems from "@/app/api/v1/cart/items/route";
import * as cartItem from "@/app/api/v1/cart/items/[id]/route";
import * as cartCoupon from "@/app/api/v1/cart/coupon/route";
import * as login from "@/app/api/v1/auth/login/route";
import * as wishlist from "@/app/api/v1/wishlist/route";
import * as moveToCart from "@/app/api/v1/wishlist/[productId]/move-to-cart/route";
import * as addresses from "@/app/api/v1/addresses/route";
import * as addressDefault from "@/app/api/v1/addresses/[id]/default/route";

let phone: Awaited<ReturnType<typeof makeProduct>>;
let cable: Awaited<ReturnType<typeof makeProduct>>;
const guestCookie = (r: { cookies: Record<string, string> }) => `fourd_cart=${r.cookies.fourd_cart}`;

beforeAll(async () => {
  await bootstrap();
  phone = await makeProduct({ name: "Test Phone", price: 5_000_000, compareAtPrice: 6_000_000, stock: 3, taxPercent: 18 });
  cable = await makeProduct({ name: "Test Cable", price: 49_900, stock: 100, taxPercent: 12, maxQuantityPerOrder: 5 });
});

describe("guest cart", () => {
  it("creates a guest cart on first add, sets a cart cookie, and computes totals server-side", async () => {
    const add = await call(cartItems.POST, { method: "POST", body: { variantId: phone.variants[0]!.id, quantity: 2, price: 1, unitPrice: 1 } });
    expect(add.status).toBe(201);
    expect(add.cookies.fourd_cart).toBeTruthy();
    const c = add.body.data;
    expect(c.items[0]).toMatchObject({ quantity: 2, unitPrice: 5_000_000, lineTotal: 10_000_000 }); // client "price" fields are ignored
    expect(c.pricing).toMatchObject({ subtotal: 10_000_000, mrpSavings: 2_000_000, grandTotal: 10_000_000 + c.pricing.shippingTotal, pricesIncludeTax: true });
    expect(c.pricing.taxTotal).toBe(Math.round((10_000_000 * 1800) / 11_800));
    const stored = await db.cart.findFirstOrThrow({ include: { items: true } });
    expect(stored.guestToken).not.toBe(add.cookies.fourd_cart); // only a hash is stored
    expect(stored.items[0]!.priceAtAdd).toBe(5_000_000);
  });

  it("persists across requests through the cookie and shows a delivery estimate", async () => {
    const first = await call(cartItems.POST, { method: "POST", body: { variantId: cable.variants[0]!.id } });
    const view = await call(cart.GET, { cookie: guestCookie(first) });
    expect(view.body.data.items).toHaveLength(1);
    expect(view.body.data.shipping.selected.code).toBe("standard");
    expect(view.body.data.shipping.options.length).toBeGreaterThan(0);
  });

  it("returns an empty, valid cart for visitors who never added anything", async () => {
    const res = await call(cart.GET);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ items: [], itemCount: 0, pricing: { grandTotal: 0 } });
  });

  it("validates stock and per-order limits with typed errors", async () => {
    const r = await call(cartItems.POST, { method: "POST", body: { variantId: phone.variants[0]!.id, quantity: 4 } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: "INSUFFICIENT_STOCK", details: { available: 3 } });
    const many = await call(cartItems.POST, { method: "POST", body: { variantId: cable.variants[0]!.id, quantity: 6 } });
    expect(many.body.error!.code).toBe("MAX_QUANTITY_EXCEEDED");
    expect((await call(cartItems.POST, { method: "POST", body: { variantId: "0198d2c0-0000-7000-8000-000000000001" } })).body.error!.code).toBe("VARIANT_NOT_FOUND");
    expect((await call(cartItems.POST, { method: "POST", body: { variantId: cable.variants[0]!.id, quantity: 0 } })).status).toBe(422);
  });

  it("adding the same variant accumulates and still respects stock", async () => {
    const a = await call(cartItems.POST, { method: "POST", body: { variantId: phone.variants[0]!.id, quantity: 2 } });
    const cookie = guestCookie(a);
    const b = await call(cartItems.POST, { method: "POST", cookie, body: { variantId: phone.variants[0]!.id, quantity: 1 } });
    expect(b.body.data.items[0].quantity).toBe(3);
    const c = await call(cartItems.POST, { method: "POST", cookie, body: { variantId: phone.variants[0]!.id, quantity: 1 } });
    expect(c.status).toBe(409);
  });

  it("updates quantity, saves for later, removes, and cannot touch another visitor's cart", async () => {
    const a = await call(cartItems.POST, { method: "POST", body: { variantId: cable.variants[0]!.id, quantity: 2 } });
    const cookie = guestCookie(a);
    const itemId = a.body.data.items[0].id;
    const up = await call(cartItem.PATCH, { method: "PATCH", cookie, params: { id: itemId }, body: { quantity: 4 } });
    expect(up.body.data.items[0].quantity).toBe(4);
    const saved = await call(cartItem.PATCH, { method: "PATCH", cookie, params: { id: itemId }, body: { savedForLater: true } });
    expect(saved.body.data.items).toHaveLength(0);
    expect(saved.body.data.savedForLater).toHaveLength(1);
    const stranger = await call(cartItem.DELETE, { method: "DELETE", cookie: "fourd_cart=someone-else-token", params: { id: itemId } });
    expect(stranger.status).toBe(404);
    const del = await call(cartItem.DELETE, { method: "DELETE", cookie, params: { id: itemId } });
    expect(del.body.data.savedForLater).toHaveLength(0);
  });
});

describe("coupons in the cart", () => {
  it("applies a valid coupon and reflects it in totals; rejects bad ones with specific codes", async () => {
    await makeCoupon({ code: "SAVE10", value: 10, minSubtotal: 100_000 });
    await makeCoupon({ code: "BIG", type: "FIXED_AMOUNT", value: 500_000, minSubtotal: 50_000_000 });
    await makeCoupon({ code: "OLD", endsAt: new Date(Date.now() - 1000) });
    await makeCoupon({ code: "OFF", isActive: false });
    const a = await call(cartItems.POST, { method: "POST", body: { variantId: phone.variants[0]!.id, quantity: 1 } });
    const cookie = guestCookie(a);
    const code = async (c: string) => (await call(cartCoupon.POST, { method: "POST", cookie, body: { code: c } })).body.error?.code;
    expect(await code("BIG")).toBe("COUPON_MIN_SUBTOTAL");
    const ok = await call(cartCoupon.POST, { method: "POST", cookie, body: { code: "save10" } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.pricing).toMatchObject({ couponDiscount: 500_000 });
    expect(ok.body.data.coupons.applied[0].code).toBe("SAVE10");
    expect(await code("NOPE")).toBe("COUPON_NOT_FOUND");
    expect(await code("OLD")).toBe("COUPON_EXPIRED");
    expect(await code("OFF")).toBe("COUPON_INVALID");
    const removed = await call(cartCoupon.DELETE, { method: "DELETE", cookie, body: { code: "SAVE10" } });
    expect(removed.body.data.pricing.couponDiscount).toBe(0);
  });

  it("enforces first-order-only and user-restricted coupons for guests and customers", async () => {
    await makeCoupon({ code: "FIRST", firstOrderOnly: true });
    await makeCoupon({ code: "ONLYME", restrictedToUserId: (await createUser()).id });
    const a = await call(cartItems.POST, { method: "POST", body: { variantId: cable.variants[0]!.id } });
    const cookie = guestCookie(a);
    expect((await call(cartCoupon.POST, { method: "POST", cookie, body: { code: "FIRST" } })).body.error!.code).toBe("COUPON_INVALID"); // needs sign-in
    const u = await createUser();
    const { token } = await sessionFor(u.id);
    await call(cartItems.POST, { method: "POST", token, body: { variantId: cable.variants[0]!.id } });
    expect((await call(cartCoupon.POST, { method: "POST", token, body: { code: "FIRST" } })).status).toBe(200);
    expect((await call(cartCoupon.POST, { method: "POST", token, body: { code: "ONLYME" } })).body.error!.code).toBe("COUPON_INVALID");
  });
});

describe("price & availability awareness", () => {
  it("flags a price change since the item was added and always charges the current price", async () => {
    const p = await makeProduct({ name: "Volatile", price: 100_000, stock: 5 });
    const a = await call(cartItems.POST, { method: "POST", body: { variantId: p.variants[0]!.id } });
    const cookie = guestCookie(a);
    await updateVariant(await systemActor(), p.variants[0]!.id, { price: 120_000 });
    invalidate();
    const view = await call(cart.GET, { cookie });
    expect(view.body.data.items[0]).toMatchObject({ unitPrice: 120_000, priceChanged: { from: 100_000, to: 120_000 } });
    expect(view.body.data.issues.some((i: any) => i.code === "PRICE_CHANGED")).toBe(true);
    expect(view.body.data.pricing.subtotal).toBe(120_000);
  });

  it("excludes items that sold out after being added, without losing them", async () => {
    const p = await makeProduct({ name: "Fleeting", price: 100_000, stock: 2 });
    const a = await call(cartItems.POST, { method: "POST", body: { variantId: p.variants[0]!.id, quantity: 2 } });
    await db.inventory.update({ where: { variantId: p.variants[0]!.id }, data: { quantity: 0 } });
    const view = await call(cart.GET, { cookie: guestCookie(a) });
    expect(view.body.data.items[0]).toMatchObject({ purchasable: false });
    expect(view.body.data.items[0].issues[0].code).toBe("OUT_OF_STOCK");
    expect(view.body.data.pricing.subtotal).toBe(0);
  });
});

describe("guest → customer merge", () => {
  it("merges the guest cart into the user's on login and clears the guest cookie", async () => {
    const u = await createUser();
    const { token } = await sessionFor(u.id);
    await call(cartItems.POST, { method: "POST", token, body: { variantId: cable.variants[0]!.id, quantity: 1 } });
    const g = await call(cartItems.POST, { method: "POST", body: { variantId: cable.variants[0]!.id, quantity: 2 } });
    await call(cartItems.POST, { method: "POST", cookie: guestCookie(g), body: { variantId: phone.variants[0]!.id, quantity: 1 } });
    const l = await call(login.POST, { method: "POST", cookie: guestCookie(g), body: { email: u.email, password: PASSWORD }, headers: { "x-auth-mode": "token" } });
    expect(l.status).toBe(200);
    expect(l.headers.get("set-cookie")).toMatch(/fourd_cart=;|fourd_cart=\s*;|Max-Age=0/i);
    const view = await call(cart.GET, { token: l.body.data.session.token });
    const byName = Object.fromEntries(view.body.data.items.map((i: any) => [i.name, i.quantity]));
    expect(byName).toEqual({ "Test Cable": 3, "Test Phone": 1 });
    const again = await call(cart.GET, { cookie: guestCookie(g) });
    expect(again.body.data.items).toHaveLength(0); // guest cart was consumed
  });
});

describe("wishlist & addresses", () => {
  it("manages a wishlist with price-drop awareness and moves items to the cart", async () => {
    const p = await makeProduct({ name: "Wish Item", price: 200_000, stock: 5 });
    const u = await createUser();
    const { token } = await sessionFor(u.id);
    expect((await call(wishlist.GET)).status).toBe(401);
    expect((await call(wishlist.POST, { method: "POST", token, body: { productId: p.id } })).status).toBe(201);
    expect((await call(wishlist.POST, { method: "POST", token, body: { productId: p.id } })).status).toBe(201); // idempotent
    await updateVariant(await systemActor(), p.variants[0]!.id, { price: 150_000 });
    const list = await call(wishlist.GET, { token });
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0]).toMatchObject({ priceChange: { from: 200_000, to: 150_000, dropped: true }, availability: { inStock: true } });
    const moved = await call(moveToCart.POST, { method: "POST", token, params: { productId: p.id }, body: {} });
    expect(moved.body.data.items[0].name).toBe("Wish Item");
    expect((await call(wishlist.GET, { token })).body.data.items).toHaveLength(0);
  });

  it("keeps exactly one default address and validates input", async () => {
    const u = await createUser();
    const { token } = await sessionFor(u.id);
    const body = { fullName: "Asha Rao", phone: "+91 98100 00001", line1: "12 Residency Road", city: "Pune", state: "Maharashtra", postalCode: "411001" };
    const a1 = await call(addresses.POST, { method: "POST", token, body });
    const a2 = await call(addresses.POST, { method: "POST", token, body: { ...body, line1: "99 Other Road", isDefault: true } });
    expect(a1.body.data.isDefault).toBe(true); // first becomes default automatically
    expect(a2.body.data.phone).toBe("+919810000001"); // normalised
    const list = await call(addresses.GET, { token });
    expect(list.body.data.filter((a: any) => a.isDefault)).toHaveLength(1);
    expect(list.body.data[0].id).toBe(a2.body.data.id);
    await call(addressDefault.POST, { method: "POST", token, params: { id: a1.body.data.id } });
    expect((await call(addresses.GET, { token })).body.data.filter((a: any) => a.isDefault)[0].id).toBe(a1.body.data.id);
    expect((await call(addresses.POST, { method: "POST", token, body: { ...body, postalCode: "!!" } })).status).toBe(422);
    const other = await createUser();
    expect((await call(addresses.GET, { token: (await sessionFor(other.id)).token })).body.data).toEqual([]);
  });
});
