import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { call } from "../support/api";
import { availableStock, bootstrap, createUser, makeAddress, makeProduct, sessionFor, staffSession } from "../support/fixtures";
import { db } from "@/server/db/client";
import { addItem } from "@/server/services/cart";
import { mockSign } from "@/server/integrations/payments/mock";
import * as checkout from "@/app/api/v1/checkout/create/route";
import * as confirm from "@/app/api/v1/payments/confirm/route";
import * as adminStatus from "@/app/api/v1/admin/orders/[id]/status/route";
import * as returnReq from "@/app/api/v1/orders/[id]/returns/route";
import * as returnGet from "@/app/api/v1/returns/[id]/route";
import * as returnCancel from "@/app/api/v1/returns/[id]/cancel/route";
import * as adminDecision from "@/app/api/v1/admin/returns/[id]/decision/route";
import * as adminAdvance from "@/app/api/v1/admin/returns/[id]/advance/route";
import * as adminRefund from "@/app/api/v1/admin/orders/[id]/refunds/route";
import * as processRefund from "@/app/api/v1/admin/refunds/[id]/process/route";
import * as orderById from "@/app/api/v1/orders/[id]/route";
import * as shipments from "@/app/api/v1/admin/orders/[id]/shipments/route";
import * as shipmentUpdate from "@/app/api/v1/admin/shipments/[id]/route";
import * as trackingEvent from "@/app/api/v1/admin/orders/[id]/tracking/route";
import * as tracking from "@/app/api/v1/tracking/[id]/route";
import * as invoice from "@/app/api/v1/orders/[id]/invoice/route";
import * as productReviews from "@/app/api/v1/products/[slug]/reviews/route";
import * as reviewHelpful from "@/app/api/v1/reviews/[id]/helpful/route";
import * as adminModerate from "@/app/api/v1/admin/reviews/[id]/moderate/route";
import * as productDetail from "@/app/api/v1/products/[slug]/route";

beforeAll(bootstrap);

async function buyer() {
  const u = await createUser();
  const { token } = await sessionFor(u.id);
  const a = await makeAddress(u.id);
  return { id: u.id, token, addressId: a.id };
}
type Buyer = Awaited<ReturnType<typeof buyer>>;

async function orderDelivered(b: Buyer, opts: { method?: "COD" | "ONLINE"; qty?: number; price?: number; stock?: number } = {}) {
  const p = await makeProduct({ price: opts.price ?? 500_000, stock: opts.stock ?? 10 });
  await addItem({ userId: b.id }, { variantId: p.variants[0]!.id, quantity: opts.qty ?? 2 });
  const co = await call(checkout.POST, { method: "POST", token: b.token, headers: { "idempotency-key": randomUUID() }, body: { addressId: b.addressId, paymentMethod: opts.method ?? "COD" } });
  const orderId = co.body.data.order.id as string;
  if (opts.method === "ONLINE") {
    const pay = await db.payment.findUniqueOrThrow({ where: { id: co.body.data.payment.id } });
    await call(confirm.POST, { method: "POST", token: b.token, body: { paymentId: pay.id, providerPayload: { outcome: "success", signature: mockSign(pay.providerPaymentId!, "success") } } });
  }
  const ops = await staffSession("order_manager");
  for (const status of ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]) await call(adminStatus.POST, { method: "POST", token: ops.token, params: { id: orderId }, body: { status } });
  return { p, orderId, ops };
}

describe("returns & refunds", () => {
  it("handles a partial return end to end for an online-paid order", async () => {
    const b = await buyer();
    const { p, orderId } = await orderDelivered(b, { method: "ONLINE", qty: 2, price: 500_000 });
    const order = (await call(orderById.GET, { token: b.token, params: { id: orderId } })).body.data;
    const item = order.items[0];
    expect(order.actions.canReturn).toBe(true);
    const sellerSide = await staffSession("order_manager");

    // over-return is rejected
    const tooMany = await call(returnReq.POST, { method: "POST", token: b.token, params: { id: orderId }, body: { items: [{ orderItemId: item.id, quantity: 3 }], reason: "Damaged" } });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.error!.code).toBe("RETURN_NOT_ELIGIBLE");

    // request 1 of 2
    const rr = await call(returnReq.POST, { method: "POST", token: b.token, params: { id: orderId }, body: { items: [{ orderItemId: item.id, quantity: 1 }], reason: "Defective on arrival", resolution: "REFUND" } });
    expect(rr.status).toBe(201);
    const retId = rr.body.data.id as string;
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("RETURN_REQUESTED");

    // the remaining unit can still be requested but not more than what is left (1 pending + 1 new = 2 ok; a third is not)
    const second = await call(returnReq.POST, { method: "POST", token: b.token, params: { id: orderId }, body: { items: [{ orderItemId: item.id, quantity: 2 }], reason: "x y z" } });
    expect(second.body.error!.code).toBe("RETURN_NOT_ELIGIBLE");

    // state machine on the return itself
    expect((await call(adminAdvance.POST, { method: "POST", token: sellerSide.token, params: { id: retId }, body: { status: "RECEIVED" } })).status).toBe(409);
    expect((await call(adminDecision.POST, { method: "POST", token: sellerSide.token, params: { id: retId }, body: { approve: true, note: "OK" } })).body.data.status).toBe("APPROVED");
    await call(adminAdvance.POST, { method: "POST", token: sellerSide.token, params: { id: retId }, body: { status: "PICKUP_SCHEDULED", pickupScheduledAt: new Date(Date.now() + 86_400_000).toISOString() } });
    await call(adminAdvance.POST, { method: "POST", token: sellerSide.token, params: { id: retId }, body: { status: "PICKED_UP" } });
    const received = await call(adminAdvance.POST, { method: "POST", token: sellerSide.token, params: { id: retId }, body: { status: "RECEIVED" } });
    expect(received.status).toBe(200);

    // goods back on the shelf, money back to the customer, order returns to DELIVERED (partial)
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { refunds: true, items: true } });
    expect(o.items[0]!.returnedQuantity).toBe(1);
    const expectedRefund = Math.round(o.items[0]!.lineTotal / 2);
    expect(o.refunds).toHaveLength(1);
    expect(o.refunds[0]).toMatchObject({ amount: expectedRefund, status: "SUCCEEDED", returnRequestId: retId });
    expect(o).toMatchObject({ status: "DELIVERED", paymentStatus: "PARTIALLY_REFUNDED", refundedTotal: expectedRefund });
    expect(await availableStock(p.variants[0]!.id)).toMatchObject({ onHand: 9, sold: 1 });
    const done = (await call(returnGet.GET, { token: b.token, params: { id: retId } })).body.data;
    expect(done.status).toBe("COMPLETED");
    expect(done.timeline.every((s: any) => s.state === "completed" || s.status === "REFUND_PENDING" || s.state === "upcoming" || s.state === "current")).toBe(true);

    // return the second unit too → order becomes RETURNED, fully refunded
    const rr2 = await call(returnReq.POST, { method: "POST", token: b.token, params: { id: orderId }, body: { items: [{ orderItemId: item.id, quantity: 1 }], reason: "Changed my mind" } });
    const id2 = rr2.body.data.id;
    await call(adminDecision.POST, { method: "POST", token: sellerSide.token, params: { id: id2 }, body: { approve: true } });
    await call(adminAdvance.POST, { method: "POST", token: sellerSide.token, params: { id: id2 }, body: { status: "RECEIVED" } });
    const fin = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(fin).toMatchObject({ status: "RETURNED", paymentStatus: "REFUNDED", refundedTotal: fin.grandTotal - (fin.grandTotal - (expectedRefund + (await db.refund.findFirstOrThrow({ where: { returnRequestId: id2 } })).amount)) });
    expect(fin.refundedTotal).toBeLessThanOrEqual(fin.grandTotal);
  });

  it("COD returns create a manual refund that completes only when staff confirm the payout", async () => {
    const b = await buyer();
    const { orderId } = await orderDelivered(b, { method: "COD", qty: 1 });
    const item = (await call(orderById.GET, { token: b.token, params: { id: orderId } })).body.data.items[0];
    const ops = await staffSession("order_manager");
    const rr = await call(returnReq.POST, { method: "POST", token: b.token, params: { id: orderId }, body: { items: [{ orderItemId: item.id, quantity: 1 }], reason: "Wrong colour sent" } });
    const id = rr.body.data.id;
    await call(adminDecision.POST, { method: "POST", token: ops.token, params: { id }, body: { approve: true } });
    await call(adminAdvance.POST, { method: "POST", token: ops.token, params: { id }, body: { status: "RECEIVED" } });
    const refund = await db.refund.findFirstOrThrow({ where: { returnRequestId: id } });
    expect(refund.status).toBe("PENDING");
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id } })).status).toBe("REFUND_PENDING");
    const done = await call(processRefund.POST, { method: "POST", token: ops.token, params: { id: refund.id } });
    expect(done.body.data.status).toBe("SUCCEEDED");
    await call(processRefund.POST, { method: "POST", token: ops.token, params: { id: refund.id } }); // idempotent
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id } })).status).toBe("COMPLETED");
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("RETURNED");
  });

  it("rejection and customer cancellation return the order to DELIVERED", async () => {
    const b = await buyer();
    const { orderId } = await orderDelivered(b, { qty: 1 });
    const item = (await call(orderById.GET, { token: b.token, params: { id: orderId } })).body.data.items[0];
    const ops = await staffSession("order_manager");
    const r1 = await call(returnReq.POST, { method: "POST", token: b.token, params: { id: orderId }, body: { items: [{ orderItemId: item.id, quantity: 1 }], reason: "Not needed" } });
    const rejected = await call(adminDecision.POST, { method: "POST", token: ops.token, params: { id: r1.body.data.id }, body: { approve: false, note: "Used item" } });
    expect(rejected.body.data.status).toBe("REJECTED");
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("DELIVERED");
    const r2 = await call(returnReq.POST, { method: "POST", token: b.token, params: { id: orderId }, body: { items: [{ orderItemId: item.id, quantity: 1 }], reason: "Changed mind again" } });
    const cancelled = await call(returnCancel.POST, { method: "POST", token: b.token, params: { id: r2.body.data.id } });
    expect(cancelled.body.data.status).toBe("CANCELLED");
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("DELIVERED");
  });

  it("closes the window after the policy period and blocks undelivered / foreign orders", async () => {
    const b = await buyer();
    const { orderId } = await orderDelivered(b, { qty: 1 });
    const item = (await call(orderById.GET, { token: b.token, params: { id: orderId } })).body.data.items[0];
    await db.order.update({ where: { id: orderId }, data: { deliveredAt: new Date(Date.now() - 30 * 86_400_000) } });
    const late = await call(returnReq.POST, { method: "POST", token: b.token, params: { id: orderId }, body: { items: [{ orderItemId: item.id, quantity: 1 }], reason: "Too late now" } });
    expect(late.body.error!.code).toBe("RETURN_NOT_ELIGIBLE");
    const other = await buyer();
    const notMine = await call(returnReq.POST, { method: "POST", token: other.token, params: { id: orderId }, body: { items: [{ orderItemId: item.id, quantity: 1 }], reason: "Not my order" } });
    expect(notMine.status).toBe(404);
  });

  it("admin refunds are idempotent per key, capped at the paid amount, and COD-unpaid orders are not refundable", async () => {
    const b = await buyer();
    const { orderId } = await orderDelivered(b, { method: "ONLINE", qty: 1, price: 1_000_000 });
    const mgr = await staffSession("manager");
    const key = randomUUID();
    const send = (amount: number, k = key) => call(adminRefund.POST, { method: "POST", token: mgr.token, params: { id: orderId }, headers: { "idempotency-key": k }, body: { amount, reason: "Goodwill gesture" } });
    const r1 = await send(200_000);
    const r2 = await send(200_000); // retry of the same request
    expect(r1.status).toBe(201);
    expect(r2.body.data.id).toBe(r1.body.data.id);
    expect(await db.refund.count({ where: { orderId } })).toBe(1);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.refundedTotal).toBe(200_000);
    const over = await send(order.grandTotal, randomUUID());
    expect(over.status).toBe(422);
    expect(over.body.error!.code).toBe("REFUND_EXCEEDS_PAID");
    const parallel = await Promise.all([send(order.grandTotal - 200_000, randomUUID()), send(order.grandTotal - 200_000, randomUUID())]);
    expect(parallel.map((r) => r.status).sort()).toEqual([201, 422]); // two racing full refunds: only one fits
    const final = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(final).toMatchObject({ refundedTotal: final.grandTotal, paymentStatus: "REFUNDED" });

    const cod = await buyer();
    const p = await makeProduct({ price: 100_000, stock: 3 });
    await addItem({ userId: cod.id }, { variantId: p.variants[0]!.id });
    const co = await call(checkout.POST, { method: "POST", token: cod.token, headers: { "idempotency-key": randomUUID() }, body: { addressId: cod.addressId, paymentMethod: "COD" } });
    const bad = await call(adminRefund.POST, { method: "POST", token: mgr.token, params: { id: co.body.data.order.id }, headers: { "idempotency-key": randomUUID() }, body: { reason: "should fail" } });
    expect(bad.body.error!.code).toBe("REFUND_NOT_ALLOWED");
  });
});

describe("shipments & tracking timeline", () => {
  it("builds a rich, ordered timeline from carrier updates and custom events", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 300_000, stock: 5 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    const co = await call(checkout.POST, { method: "POST", token: b.token, headers: { "idempotency-key": randomUUID() }, body: { addressId: b.addressId, paymentMethod: "COD" } });
    const orderId = co.body.data.order.id;
    const ops = await staffSession("order_manager");
    for (const status of ["CONFIRMED", "PROCESSING", "PACKED"]) await call(adminStatus.POST, { method: "POST", token: ops.token, params: { id: orderId }, body: { status } });
    const sh = await call(shipments.POST, { method: "POST", token: ops.token, params: { id: orderId }, body: { carrier: "BlueDart", trackingNumber: "BD123456789" } });
    expect(sh.status).toBe(201);
    await call(shipmentUpdate.PATCH, { method: "PATCH", token: ops.token, params: { id: sh.body.data.id }, body: { status: "REACHED_HUB", location: "Pune Hub", description: "Arrived at sorting hub" } });
    await call(trackingEvent.POST, { method: "POST", token: ops.token, params: { id: orderId }, body: { title: "Customs-free zone cleared", location: "Pune" } });
    await call(shipmentUpdate.PATCH, { method: "PATCH", token: ops.token, params: { id: sh.body.data.id }, body: { status: "OUT_FOR_DELIVERY" } });
    const t = (await call(tracking.GET, { token: b.token, params: { id: orderId } })).body.data;
    expect(t.status).toBe("OUT_FOR_DELIVERY");
    expect(t.shipments[0]).toMatchObject({ carrier: "BlueDart", trackingNumber: "BD123456789", status: "OUT_FOR_DELIVERY" });
    const codes = t.events.map((e: any) => e.code);
    expect(codes).toEqual(expect.arrayContaining(["ORDER_PLACED", "SHIPPED", "REACHED_HUB", "NOTE", "OUT_FOR_DELIVERY"]));
    expect(t.events.find((e: any) => e.code === "REACHED_HUB")).toMatchObject({ title: "Reached hub", location: "Pune Hub" });
    const times = t.events.map((e: any) => new Date(e.occurredAt).getTime());
    expect(times).toEqual([...times].sort((a: number, b2: number) => b2 - a)); // newest first
    expect(t.progress.find((s: any) => s.status === "OUT_FOR_DELIVERY").state).toBe("current");
    expect(t.progress.find((s: any) => s.status === "DELIVERED").state).toBe("upcoming");
    // only PACKED orders can ship
    expect((await call(shipments.POST, { method: "POST", token: ops.token, params: { id: orderId }, body: {} })).status).toBe(409);
  });

  it("produces an invoice with a tax breakdown that reconciles to the order total", async () => {
    const b = await buyer();
    const { orderId } = await orderDelivered(b, { qty: 3, price: 118_000 });
    const inv = (await call(invoice.GET, { token: b.token, params: { id: orderId } })).body.data;
    expect(inv.invoiceNumber).toMatch(/^INV-4D-/);
    expect(inv.taxBreakdown).toHaveLength(1);
    expect(inv.taxBreakdown[0].ratePercent).toBe(18);
    expect(inv.taxBreakdown[0].taxableAmount + inv.taxBreakdown[0].taxAmount).toBe(354_000); // inclusive pricing
    expect(inv.totals.grandTotal - inv.totals.shipping).toBe(354_000);
  });
});

describe("reviews", () => {
  it("marks verified purchase only from the order ledger, moderates, and updates rating aggregates", async () => {
    const b = await buyer();
    const { p } = await orderDelivered(b, { qty: 1 });
    const stranger = await buyer();
    const ops = await staffSession("product_manager");
    const slug = p.slug;

    const mine = await call(productReviews.POST, { method: "POST", token: b.token, params: { slug }, body: { rating: 5, title: "Great", body: "<script>alert(1)</script>Loved it", isVerifiedPurchase: true } });
    expect(mine.status).toBe(201);
    expect(mine.body.data).toMatchObject({ status: "PENDING", isVerifiedPurchase: true });
    const theirs = await call(productReviews.POST, { method: "POST", token: stranger.token, params: { slug }, body: { rating: 1, title: "Meh", body: "Never bought it", isVerifiedPurchase: true } });
    expect(theirs.body.data.isVerifiedPurchase).toBe(false); // client claim ignored
    expect((await call(productReviews.POST, { method: "POST", token: b.token, params: { slug }, body: { rating: 4 } })).body.error!.code).toBe("REVIEW_ALREADY_EXISTS");
    expect((await call(productReviews.POST, { method: "POST", params: { slug }, body: { rating: 4 } })).status).toBe(401);
    expect((await call(productReviews.POST, { method: "POST", token: b.token, params: { slug }, body: { rating: 6 } })).status).toBe(422);

    // nothing public until approved
    expect((await call(productReviews.GET, { params: { slug } })).body.data).toHaveLength(0);
    expect((await call(adminModerate.POST, { method: "POST", token: b.token, params: { id: mine.body.data.id }, body: { approve: true } })).status).toBe(403);
    await call(adminModerate.POST, { method: "POST", token: ops.token, params: { id: mine.body.data.id }, body: { approve: true } });
    await call(adminModerate.POST, { method: "POST", token: ops.token, params: { id: theirs.body.data.id }, body: { approve: false, reason: "No purchase" } });

    const pub = await call(productReviews.GET, { params: { slug } });
    expect(pub.body.data).toHaveLength(1);
    expect(pub.body.data[0].body).not.toMatch(/<script>/); // markup stripped on write
    expect(pub.body.data[0]).toMatchObject({ rating: 5, isVerifiedPurchase: true, author: { name: "Test U." } });
    expect(JSON.stringify(pub.body)).not.toContain("@example.com"); // reviewer email never leaked
    const detail = (await call(productDetail.GET, { params: { slug } })).body.data;
    expect(detail.rating).toMatchObject({ average: 5, count: 1, breakdown: { "5": 1, "1": 0 } });

    // helpful votes toggle and cannot be self-cast
    const vote = await call(reviewHelpful.POST, { method: "POST", token: stranger.token, params: { id: mine.body.data.id } });
    expect(vote.body.data).toEqual({ voted: true, helpfulCount: 1 });
    expect((await call(reviewHelpful.POST, { method: "POST", token: stranger.token, params: { id: mine.body.data.id } })).body.data).toEqual({ voted: false, helpfulCount: 0 });
    expect((await call(reviewHelpful.POST, { method: "POST", token: b.token, params: { id: mine.body.data.id } })).status).toBe(409);
  });

  it("does not grant verified status for cancelled or undelivered purchases", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 100_000, stock: 3 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id });
    await call(checkout.POST, { method: "POST", token: b.token, headers: { "idempotency-key": randomUUID() }, body: { addressId: b.addressId, paymentMethod: "COD" } }); // placed, not delivered
    const r = await call(productReviews.POST, { method: "POST", token: b.token, params: { slug: p.slug }, body: { rating: 5 } });
    expect(r.body.data.isVerifiedPurchase).toBe(false);
  });
});
