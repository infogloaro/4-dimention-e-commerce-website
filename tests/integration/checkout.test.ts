import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { call } from "../support/api";
import { availableStock, bootstrap, createUser, makeAddress, makeCoupon, makeProduct, PASSWORD, sessionFor, staffSession } from "../support/fixtures";
import { db } from "@/server/db/client";
import { addItem } from "@/server/services/cart";
import { expireStaleReservations } from "@/server/services/inventory";
import { mockSign, mockSignBody } from "@/server/integrations/payments/mock";
import * as register from "@/app/api/v1/auth/register/route";
import * as login from "@/app/api/v1/auth/login/route";
import * as products from "@/app/api/v1/products/route";
import * as productDetail from "@/app/api/v1/products/[slug]/route";
import * as cartItems from "@/app/api/v1/cart/items/route";
import * as cart from "@/app/api/v1/cart/route";
import * as addresses from "@/app/api/v1/addresses/route";
import * as validate from "@/app/api/v1/checkout/validate/route";
import * as checkout from "@/app/api/v1/checkout/create/route";
import * as confirm from "@/app/api/v1/payments/confirm/route";
import * as webhook from "@/app/api/v1/payments/webhooks/[provider]/route";
import * as orders from "@/app/api/v1/orders/route";
import * as orderById from "@/app/api/v1/orders/[id]/route";
import * as orderCancel from "@/app/api/v1/orders/[id]/cancel/route";
import * as orderPay from "@/app/api/v1/orders/[id]/pay/route";
import * as tracking from "@/app/api/v1/tracking/[id]/route";
import * as adminStatus from "@/app/api/v1/admin/orders/[id]/status/route";
import * as adminOrder from "@/app/api/v1/admin/orders/[id]/route";

beforeAll(bootstrap);

interface Buyer {
  id: string;
  token: string;
  addressId: string;
}

async function buyer(): Promise<Buyer> {
  const u = await createUser();
  const { token } = await sessionFor(u.id);
  const a = await makeAddress(u.id);
  return { id: u.id, token, addressId: a.id };
}

const place = (b: Buyer, over: Record<string, unknown> = {}, key = randomUUID()) =>
  call(checkout.POST, { method: "POST", token: b.token, headers: { "idempotency-key": key }, body: { addressId: b.addressId, paymentMethod: "ONLINE", ...over } });

const pay = (b: Buyer, paymentId: string, providerPaymentId: string, outcome: "success" | "failure" = "success") =>
  call(confirm.POST, { method: "POST", token: b.token, body: { paymentId, providerPayload: { outcome, signature: mockSign(providerPaymentId, outcome) } } });

const providerId = async (paymentId: string) => (await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).providerPaymentId!;

describe("critical workflow: register → login → browse → cart → checkout → payment → order → tracking", () => {
  it("runs end to end", async () => {
    const p = await makeProduct({ name: "E2E Headphones", price: 1_000_000, compareAtPrice: 1_200_000, stock: 5 });

    // register + login
    const reg = await call(register.POST, { method: "POST", body: { name: "Eve Buyer", email: "eve@example.com", password: PASSWORD } });
    expect(reg.status).toBe(201);
    const lg = await call(login.POST, { method: "POST", body: { email: "eve@example.com", password: PASSWORD }, headers: { "x-auth-mode": "token" } });
    const token = lg.body.data.session.token as string;

    // browse → product
    const list = await call(products.GET, { query: { q: "E2E headphones" } });
    expect(list.body.data[0].slug).toBe(p.slug);
    const detail = await call(productDetail.GET, { params: { slug: p.slug } });
    const variantId = detail.body.data.variants[0].id;

    // cart → address
    const added = await call(cartItems.POST, { method: "POST", token, body: { variantId, quantity: 2 } });
    expect(added.body.data.pricing.subtotal).toBe(2_000_000);
    const addr = await call(addresses.POST, { method: "POST", token, body: { fullName: "Eve Buyer", phone: "9810000099", line1: "5 Lake View", city: "Mumbai", state: "Maharashtra", postalCode: "400050" } });
    const addressId = addr.body.data.id;

    // dry-run validation shows server-computed totals + shipping options + payment methods
    const v = await call(validate.POST, { method: "POST", token, body: { addressId } });
    expect(v.body.data).toMatchObject({ valid: true, pricing: { subtotal: 2_000_000 } });
    expect(v.body.data.shipping.options.map((o: any) => o.code)).toEqual(["standard", "express"]);
    expect(v.body.data.shipping.selected.zone).toMatch(/Metro/); // 400xxx postal prefix
    expect(await db.order.count()).toBe(0); // validation creates nothing

    // checkout (online): order exists but is NOT placed; stock is reserved not sold
    const co = await place({ id: "", token, addressId }, { expectedTotal: v.body.data.pricing.grandTotal });
    expect(co.status).toBe(201);
    expect(co.body.data).toMatchObject({ nextAction: "COMPLETE_PAYMENT", order: { status: "PENDING_PAYMENT", paymentStatus: "PENDING" }, payment: { provider: "MOCK", status: "REQUIRES_ACTION" } });
    expect(co.body.data.payment.clientPayload).not.toHaveProperty("secret");
    expect(await availableStock(variantId)).toMatchObject({ onHand: 5, reserved: 2, sold: 0, available: 3 });
    const orderId = co.body.data.order.id;

    // payment confirmation
    const paid = await call(confirm.POST, { method: "POST", token, body: { paymentId: co.body.data.payment.id, providerPayload: { outcome: "success", signature: mockSign(co.body.data.payment.clientPayload.paymentRef, "success") } } });
    expect(paid.body.data).toMatchObject({ outcome: "SUCCESS", order: { status: "PLACED", paymentStatus: "PAID" } });
    expect(await availableStock(variantId)).toMatchObject({ onHand: 3, reserved: 0, sold: 2 });
    expect((await call(cart.GET, { token })).body.data.items).toHaveLength(0); // cart converted

    // order + invoice-ready snapshot
    const o = (await call(orderById.GET, { token, params: { id: orderId } })).body.data;
    expect(o.orderNumber).toMatch(/^4D-\d{6}-[A-Z0-9]{6}$/);
    expect(o.items[0]).toMatchObject({ name: "E2E Headphones", quantity: 2, unitPrice: 1_000_000, sku: expect.any(String) });
    expect(o.totals.grandTotal).toBe(v.body.data.pricing.grandTotal);
    expect(o.shippingAddress).toMatchObject({ city: "Mumbai", postalCode: "400050" });

    // tracking timeline (state-driven)
    const t = (await call(tracking.GET, { token, params: { id: orderId } })).body.data;
    expect(t.progress.map((s: any) => [s.status, s.state]).slice(0, 3)).toEqual([["PLACED", "current"], ["CONFIRMED", "upcoming"], ["PROCESSING", "upcoming"]]);
    expect(t.events.map((e: any) => e.code)).toEqual(expect.arrayContaining(["ORDER_CREATED", "PAYMENT_CONFIRMED", "ORDER_PLACED"]));

    // fulfilment by staff
    const ops = await staffSession("order_manager");
    for (const status of ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      const r = await call(adminStatus.POST, { method: "POST", token: ops.token, params: { id: orderId }, body: { status, note: "test fulfilment" } });
      expect(r.status, status).toBe(200);
    }
    const done = (await call(tracking.GET, { token, params: { id: orderId } })).body.data;
    expect(done.progress.every((s: any) => s.state === "completed")).toBe(true);
    expect(done.events[0].code).toBe("DELIVERED");
    const final = (await call(orderById.GET, { token, params: { id: orderId } })).body.data;
    expect(final.actions).toMatchObject({ canCancel: false, canReturn: true, canReview: true });
    expect((await call(orders.GET, { token })).body).toMatchObject({ meta: { total: 1 }, data: [{ status: "DELIVERED" }] });
  });
});

describe("COD", () => {
  it("places the order immediately, commits stock, and records the cash at delivery", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 300_000, stock: 4 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id, quantity: 1 });
    const co = await place(b, { paymentMethod: "COD" });
    expect(co.body.data).toMatchObject({ nextAction: "ORDER_CONFIRMED", payment: null, order: { status: "PLACED", paymentStatus: "UNPAID" } });
    expect(await availableStock(p.variants[0]!.id)).toMatchObject({ onHand: 3, reserved: 0, sold: 1 });
    const ops = await staffSession("order_manager");
    for (const status of ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]) await call(adminStatus.POST, { method: "POST", token: ops.token, params: { id: co.body.data.order.id }, body: { status, note: "test fulfilment" } });
    const o = await db.order.findUniqueOrThrow({ where: { id: co.body.data.order.id }, include: { payments: true } });
    expect(o.paymentStatus).toBe("PAID");
    expect(o.payments[0]).toMatchObject({ provider: "COD", status: "CAPTURED" });
  });
});

describe("idempotency", () => {
  it("replays the stored response for a repeated key and creates exactly one order", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 100_000, stock: 5 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id, quantity: 1 });
    const key = randomUUID();
    const first = await place(b, { paymentMethod: "COD" }, key);
    const second = await place(b, { paymentMethod: "COD" }, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotent-replay")).toBe("true");
    expect(second.body.data.order.id).toBe(first.body.data.order.id);
    expect(await db.order.count({ where: { userId: b.id } })).toBe(1);
    expect(await availableStock(p.variants[0]!.id)).toMatchObject({ sold: 1 }); // stock deducted once
  });

  it("rejects key reuse with a different payload and requires a key at all", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 100_000, stock: 5 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    const key = randomUUID();
    await place(b, { paymentMethod: "COD" }, key);
    const reuse = await place(b, { paymentMethod: "COD", notes: "different" }, key);
    expect(reuse.status).toBe(422);
    expect(reuse.body.error!.code).toBe("IDEMPOTENCY_KEY_REUSED");
    const none = await call(checkout.POST, { method: "POST", token: b.token, body: { addressId: b.addressId, paymentMethod: "COD" } });
    expect(none.status).toBe(400);
  });

  it("concurrent identical requests produce one order", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 100_000, stock: 5 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    const key = randomUUID();
    const results = await Promise.all([place(b, { paymentMethod: "COD" }, key), place(b, { paymentMethod: "COD" }, key), place(b, { paymentMethod: "COD" }, key)]);
    expect(results.filter((r) => r.status === 201).length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.status === 201 || r.body.error?.code === "REQUEST_IN_PROGRESS")).toBe(true);
    expect(await db.order.count({ where: { userId: b.id } })).toBe(1);
  });
});

describe("payment states", () => {
  it("handles failure → retry → success without creating a second order", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 250_000, stock: 3 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    const co = await place(b);
    const orderId = co.body.data.order.id;
    const pid1 = await providerId(co.body.data.payment.id);

    const bad = await call(confirm.POST, { method: "POST", token: b.token, body: { paymentId: co.body.data.payment.id, providerPayload: { outcome: "success", signature: "forged" } } });
    expect(bad.status).toBe(400);
    expect(bad.body.error!.code).toBe("PAYMENT_SIGNATURE_INVALID");
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PENDING_PAYMENT");

    const failed = await pay(b, co.body.data.payment.id, pid1, "failure");
    expect(failed.body.data).toMatchObject({ outcome: "FAILED_CAN_RETRY", paymentStatus: "FAILED" });
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PENDING_PAYMENT");
    expect(await availableStock(p.variants[0]!.id)).toMatchObject({ reserved: 1 }); // still held for the retry

    const retry = await call(orderPay.POST, { method: "POST", token: b.token, params: { id: orderId } });
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).not.toBe(co.body.data.payment.id);
    const ok = await pay(b, retry.body.data.id, await providerId(retry.body.data.id));
    expect(ok.body.data).toMatchObject({ outcome: "SUCCESS", order: { status: "PLACED" } });
    expect(await db.order.count({ where: { userId: b.id } })).toBe(1);
  });

  it("confirming twice (client retry) is harmless and counts stock once", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 250_000, stock: 3 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    const co = await place(b);
    const pid = await providerId(co.body.data.payment.id);
    const [a1, a2] = await Promise.all([pay(b, co.body.data.payment.id, pid), pay(b, co.body.data.payment.id, pid)]);
    expect(a1.status).toBe(200);
    expect(a2.status).toBe(200);
    expect(await availableStock(p.variants[0]!.id)).toMatchObject({ onHand: 2, reserved: 0, sold: 1 });
    const o = await db.order.findUniqueOrThrow({ where: { id: co.body.data.order.id }, include: { statusHistory: true } });
    expect(o.statusHistory.filter((h) => h.toStatus === "PLACED")).toHaveLength(1);
    expect(await db.user.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ ordersCount: 1 });
  });

  it("does not let one customer confirm another customer's payment", async () => {
    const b = await buyer();
    const attacker = await buyer();
    const p = await makeProduct({ price: 250_000, stock: 3 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    const co = await place(b);
    const res = await pay(attacker, co.body.data.payment.id, await providerId(co.body.data.payment.id));
    expect(res.status).toBe(404);
  });
});

describe("payment webhooks", () => {
  const send = (body: object, opts: { signature?: string } = {}) => {
    const raw = JSON.stringify(body);
    return call(webhook.POST, { method: "POST", params: { provider: "mock" }, raw, headers: { "content-type": "application/json", "x-mock-signature": opts.signature ?? mockSignBody(raw) }, origin: false });
  };

  async function pending() {
    const b = await buyer();
    const p = await makeProduct({ price: 400_000, stock: 5 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    const co = await place(b);
    return { b, p, co, pid: await providerId(co.body.data.payment.id), orderId: co.body.data.order.id as string };
  }

  it("rejects unsigned and wrongly signed payloads", async () => {
    const { pid } = await pending();
    const body = { id: "evt_1", type: "payment.captured", paymentId: pid };
    expect((await send(body, { signature: "bad" })).status).toBe(401);
    expect((await call(webhook.POST, { method: "POST", params: { provider: "mock" }, raw: JSON.stringify(body), origin: false })).status).toBe(401);
    expect((await call(webhook.POST, { method: "POST", params: { provider: "nope" }, raw: "{}", origin: false })).status).toBe(404);
    expect(await db.webhookEvent.count()).toBe(0);
  });

  it("places the order from a captured event and acknowledges duplicates without re-processing", async () => {
    const { orderId, pid, p } = await pending();
    const evt = { id: `evt_${randomUUID()}`, type: "payment.captured", paymentId: pid, chargeId: "chg_1", amount: 400_000 + (await db.order.findUniqueOrThrow({ where: { id: orderId } })).shippingTotal + 0 };
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    evt.amount = order.grandTotal;
    const first = await send(evt);
    expect(first.body.data.status).toBe("processed");
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PLACED");
    const dup = await send(evt);
    expect(dup.body.data.status).toBe("duplicate");
    const replayNewId = await send({ ...evt, id: `evt_${randomUUID()}` }); // provider re-sent under a new event id
    expect(replayNewId.status).toBe(200);
    expect(await availableStock(p.variants[0]!.id)).toMatchObject({ sold: 1, reserved: 0, onHand: 4 });
    const placed = await db.orderStatusHistory.count({ where: { orderId, toStatus: "PLACED" } });
    expect(placed).toBe(1);
  });

  it("webhook then client confirm (or the reverse) still yields a single placement", async () => {
    const { b, co, pid, orderId } = await pending();
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    await send({ id: `evt_${randomUUID()}`, type: "payment.captured", paymentId: pid, amount: order.grandTotal });
    const late = await pay(b, co.body.data.payment.id, pid);
    expect(late.body.data.outcome).toBe("SUCCESS");
    expect(await db.orderStatusHistory.count({ where: { orderId, toStatus: "PLACED" } })).toBe(1);
  });

  it("refuses to place an order when the captured amount does not match", async () => {
    const { orderId, pid } = await pending();
    await send({ id: `evt_${randomUUID()}`, type: "payment.captured", paymentId: pid, amount: 1 });
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } });
    expect(o.status).toBe("PENDING_PAYMENT");
    expect(o.payments[0]!.failureCode).toBe("amount_mismatch");
  });

  it("a failed event never downgrades an already captured payment", async () => {
    const { orderId, pid } = await pending();
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    await send({ id: `evt_${randomUUID()}`, type: "payment.captured", paymentId: pid, amount: order.grandTotal });
    await send({ id: `evt_${randomUUID()}`, type: "payment.failed", paymentId: pid, reason: "late noise" });
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } });
    expect(o).toMatchObject({ status: "PLACED", paymentStatus: "PAID" });
    expect(o.payments[0]!.status).toBe("CAPTURED");
  });

  it("auto-refunds money that arrives after the order was cancelled", async () => {
    const { b, orderId, pid } = await pending();
    await call(orderCancel.POST, { method: "POST", token: b.token, params: { id: orderId }, body: { reason: "changed my mind" } });
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("CANCELLED");
    await send({ id: `evt_${randomUUID()}`, type: "payment.captured", paymentId: pid, amount: order.grandTotal });
    const after = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { refunds: true } });
    expect(after.status).toBe("CANCELLED");
    expect(after.refunds).toHaveLength(1);
    expect(after.refunds[0]).toMatchObject({ amount: order.grandTotal, status: "SUCCEEDED" });
    expect(after.paymentStatus).toBe("REFUNDED");
  });
});

describe("overselling", () => {
  it("never sells the last unit twice — one buyer wins, the other gets OUT_OF_STOCK", async () => {
    const p = await makeProduct({ name: "Last One", price: 100_000, stock: 1 });
    const [a, b] = [await buyer(), await buyer()];
    // both carts legitimately contain the item (stock was 1 when they added it)
    await db.cart.create({ data: { userId: a.id, items: { create: { variantId: p.variants[0]!.id, quantity: 1, priceAtAdd: 100_000 } } } });
    await db.cart.create({ data: { userId: b.id, items: { create: { variantId: p.variants[0]!.id, quantity: 1, priceAtAdd: 100_000 } } } });
    const [ra, rb] = await Promise.all([place(a, { paymentMethod: "COD" }), place(b, { paymentMethod: "COD" })]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(["OUT_OF_STOCK", "INSUFFICIENT_STOCK"]).toContain(loser.body.error!.code);
    expect(await availableStock(p.variants[0]!.id)).toEqual({ onHand: 0, reserved: 0, sold: 1, available: 0 });
    expect(await db.order.count({ where: { items: { some: { variantId: p.variants[0]!.id } } } })).toBe(1);
  });

  it("with stock 3 and 10 simultaneous buyers exactly 3 succeed and inventory never goes negative", async () => {
    const p = await makeProduct({ name: "Hot Drop", price: 100_000, stock: 3 });
    const buyers = await Promise.all(Array.from({ length: 10 }, buyer));
    for (const b of buyers) await db.cart.create({ data: { userId: b.id, items: { create: { variantId: p.variants[0]!.id, quantity: 1, priceAtAdd: 100_000 } } } });
    const results = await Promise.all(buyers.map((b, i) => place(b, { paymentMethod: i % 2 ? "COD" : "ONLINE" })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
    const inv = await availableStock(p.variants[0]!.id);
    expect(inv.onHand + 0).toBeGreaterThanOrEqual(0);
    expect(inv.reserved).toBeGreaterThanOrEqual(0);
    expect(inv.available).toBe(0);
    expect(inv.onHand).toBe(3 - inv.sold);
  });

  it("the database itself refuses negative or over-reserved stock", async () => {
    const p = await makeProduct({ price: 100, stock: 2 });
    const id = p.variants[0]!.id;
    await expect(db.$executeRaw`UPDATE "Inventory" SET quantity = -1 WHERE "variantId" = ${id}`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE "Inventory" SET reserved = 5 WHERE "variantId" = ${id}`).rejects.toThrow();
  });

  it("releases unpaid reservations after the payment window so stock returns to sale", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 100_000, stock: 2 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id, quantity: 2 });
    const co = await place(b);
    expect(await availableStock(p.variants[0]!.id)).toMatchObject({ available: 0 });
    await db.stockReservation.updateMany({ where: { orderId: co.body.data.order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await expireStaleReservations()).toEqual({ released: 1 });
    expect(await availableStock(p.variants[0]!.id)).toMatchObject({ available: 2, reserved: 0 });
    expect((await db.order.findUniqueOrThrow({ where: { id: co.body.data.order.id } })).status).toBe("CANCELLED");
    expect(await expireStaleReservations()).toEqual({ released: 0 }); // idempotent
    expect((await call(orderPay.POST, { method: "POST", token: b.token, params: { id: co.body.data.order.id } })).status).toBe(409);
  });
});

describe("checkout validation & trust boundaries", () => {
  it("rejects a stale expected total with PRICE_CHANGED and never trusts client totals", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 100_000, stock: 5 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    const res = await place(b, { paymentMethod: "COD", expectedTotal: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "PRICE_CHANGED", details: { expectedTotal: 1 } });
    expect(await db.order.count({ where: { userId: b.id } })).toBe(0);
    expect(await availableStock(p.variants[0]!.id)).toMatchObject({ reserved: 0 }); // rolled back completely
  });

  it("fails cleanly for an empty cart, unknown/foreign address and unserviceable destinations", async () => {
    const b = await buyer();
    expect((await place(b, { paymentMethod: "COD" })).body.error!.code).toBe("CART_EMPTY");
    const other = await buyer();
    expect((await place(b, { paymentMethod: "COD", addressId: other.addressId })).status).toBe(404);
    const p = await makeProduct({ price: 100_000, stock: 5 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    await db.shippingZone.updateMany({ data: { isActive: false } });
    expect((await place(b, { paymentMethod: "COD" })).body.error!.code).toBe("SHIPPING_UNAVAILABLE");
    await db.shippingZone.updateMany({ data: { isActive: true } });
  });

  it("blocks guests from checking out", async () => {
    expect((await call(checkout.POST, { method: "POST", headers: { "idempotency-key": randomUUID() }, body: { addressId: randomUUID(), paymentMethod: "COD" } })).status).toBe(401);
  });

  it("supports buy-now with explicit items without touching the cart", async () => {
    const b = await buyer();
    const [cartItem, nowItem] = [await makeProduct({ price: 100_000, stock: 5 }), await makeProduct({ price: 200_000, stock: 5 })];
    await addItem({ userId: b.id }, { variantId: cartItem.variants[0]!.id });
    const co = await place(b, { paymentMethod: "COD", items: [{ variantId: nowItem.variants[0]!.id, quantity: 1 }] });
    expect(co.body.data.order.items).toHaveLength(1);
    expect(co.body.data.order.items[0].name).toBe(nowItem.name);
    expect((await call(cart.GET, { token: b.token })).body.data.items).toHaveLength(1);
  });

  it("snapshots product data: later edits and deletions never change a past order", async () => {
    const b = await buyer();
    const p = await makeProduct({ name: "Snapshot Me", price: 100_000, stock: 5 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    const co = await place(b, { paymentMethod: "COD" });
    await db.productVariant.update({ where: { id: p.variants[0]!.id }, data: { price: 999_999 } });
    await db.product.update({ where: { id: p.id }, data: { name: "Renamed", status: "ARCHIVED", deletedAt: new Date() } });
    const o = (await call(orderById.GET, { token: b.token, params: { id: co.body.data.order.id } })).body.data;
    expect(o.items[0]).toMatchObject({ name: "Snapshot Me", unitPrice: 100_000 });
    expect(o.totals.grandTotal).toBe(co.body.data.order.totals.grandTotal);
  });
});

describe("coupons at checkout", () => {
  it("claims a single-use coupon atomically: concurrent buyers, exactly one gets it", async () => {
    await makeCoupon({ code: "ONCE", value: 10, usageLimit: 1 });
    const p = await makeProduct({ price: 100_000, stock: 10 });
    const buyers = [await buyer(), await buyer(), await buyer()];
    for (const b of buyers) await db.cart.create({ data: { userId: b.id, couponCodes: ["ONCE"], items: { create: { variantId: p.variants[0]!.id, quantity: 1, priceAtAdd: 100_000 } } } });
    const results = await Promise.all(buyers.map((b) => place(b, { paymentMethod: "COD" })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status !== 201).every((r) => r.body.error!.code === "COUPON_USAGE_LIMIT")).toBe(true);
    expect((await db.coupon.findUniqueOrThrow({ where: { code: "ONCE" } })).usedCount).toBe(1);
  });

  it("returns the coupon use when the order is cancelled", async () => {
    await makeCoupon({ code: "GIVEBACK", value: 10, usageLimit: 1 });
    const b = await buyer();
    const p = await makeProduct({ price: 100_000, stock: 10 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    const co = await place(b, { paymentMethod: "COD", couponCodes: ["GIVEBACK"] });
    expect(co.body.data.order.totals.discount).toBe(10_000);
    expect((await db.coupon.findUniqueOrThrow({ where: { code: "GIVEBACK" } })).usedCount).toBe(1);
    await call(orderCancel.POST, { method: "POST", token: b.token, params: { id: co.body.data.order.id }, body: { reason: "oops" } });
    expect((await db.coupon.findUniqueOrThrow({ where: { code: "GIVEBACK" } })).usedCount).toBe(0);
  });

  it("enforces per-user limits", async () => {
    await makeCoupon({ code: "TWICE", value: 5, perUserLimit: 1 });
    const b = await buyer();
    const p = await makeProduct({ price: 100_000, stock: 10 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    expect((await place(b, { paymentMethod: "COD", couponCodes: ["TWICE"] })).status).toBe(201);
    expect((await place(b, { paymentMethod: "COD", items: [{ variantId: p.variants[0]!.id, quantity: 1 }], couponCodes: ["TWICE"] })).body.error!.code).toBe("COUPON_USAGE_LIMIT");
  });
});

describe("cancellation & refunds", () => {
  it("cancelling a paid order restocks, refunds through the provider and marks it REFUNDED", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 500_000, stock: 3 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id, quantity: 2 });
    const co = await place(b);
    await pay(b, co.body.data.payment.id, await providerId(co.body.data.payment.id));
    expect(await availableStock(p.variants[0]!.id)).toMatchObject({ onHand: 1, sold: 2 });
    const res = await call(orderCancel.POST, { method: "POST", token: b.token, params: { id: co.body.data.order.id }, body: { reason: "found cheaper" } });
    expect(res.body.data).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
    expect(await availableStock(p.variants[0]!.id)).toMatchObject({ onHand: 3, sold: 0, reserved: 0 });
    const o = await db.order.findUniqueOrThrow({ where: { id: co.body.data.order.id }, include: { refunds: true } });
    expect(o.refundedTotal).toBe(o.grandTotal);
    expect(o.refunds).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).soldCount).toBe(0);
    // cancelling again is rejected, never double-refunds
    const again = await call(orderCancel.POST, { method: "POST", token: b.token, params: { id: co.body.data.order.id }, body: { reason: "again" } });
    expect(again.status).toBe(409);
    expect(await db.refund.count({ where: { orderId: co.body.data.order.id } })).toBe(1);
  });

  it("customers cannot cancel shipped orders or see other customers' orders", async () => {
    const b = await buyer();
    const intruder = await buyer();
    const p = await makeProduct({ price: 100_000, stock: 5 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    const co = await place(b, { paymentMethod: "COD" });
    const id = co.body.data.order.id;
    expect((await call(orderById.GET, { token: intruder.token, params: { id } })).status).toBe(404);
    expect((await call(orderCancel.POST, { method: "POST", token: intruder.token, params: { id }, body: {} })).status).toBe(404);
    const ops = await staffSession("order_manager");
    for (const status of ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED"]) await call(adminStatus.POST, { method: "POST", token: ops.token, params: { id }, body: { status, note: "test fulfilment" } });
    const late = await call(orderCancel.POST, { method: "POST", token: b.token, params: { id }, body: {} });
    expect(late.status).toBe(409);
    expect(late.body.error!.code).toBe("ORDER_NOT_CANCELLABLE");
  });

  it("rejects illegal status jumps with the list of allowed next states", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 100_000, stock: 5 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    const co = await place(b, { paymentMethod: "COD" });
    const ops = await staffSession("order_manager");
    const jump = await call(adminStatus.POST, { method: "POST", token: ops.token, params: { id: co.body.data.order.id }, body: { status: "DELIVERED", note: "test proof of delivery" } });
    expect(jump.status).toBe(409);
    expect(jump.body.error).toMatchObject({ code: "ORDER_STATE_INVALID", details: { from: "PLACED", allowed: ["CONFIRMED", "CANCELLED"] } });
    const detail = await call(adminOrder.GET, { token: ops.token, params: { id: co.body.data.order.id } });
    expect(detail.body.data.allowedTransitions).toEqual(["CONFIRMED", "CANCELLED"]);
  });
});

beforeEach(() => undefined);
