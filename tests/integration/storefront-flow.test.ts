import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { call } from "../support/api";
import { bootstrap, createUser, makeAddress, makeProduct, sessionFor, staffSession } from "../support/fixtures";
import { db } from "@/server/db/client";
import { addItem, viewCart } from "@/server/services/cart";
import * as checkout from "@/app/api/v1/checkout/create/route";
import * as orderById from "@/app/api/v1/orders/[id]/route";
import * as orderList from "@/app/api/v1/orders/route";
import * as orderCancel from "@/app/api/v1/orders/[id]/cancel/route";
import * as tracking from "@/app/api/v1/tracking/[id]/route";
import * as adminStatus from "@/app/api/v1/admin/orders/[id]/status/route";
import * as adminOrders from "@/app/api/v1/admin/orders/route";
import * as adminQueues from "@/app/api/v1/admin/orders/queues/route";
import * as shipments from "@/app/api/v1/admin/orders/[id]/shipments/route";
import * as shipmentUpdate from "@/app/api/v1/admin/shipments/[id]/route";
import * as art from "@/app/media/art/[slug]/[file]/route";
import { productArtUrl } from "@/prisma/product-art";

beforeAll(bootstrap);

async function buyer() {
  const u = await createUser();
  const { token } = await sessionFor(u.id);
  return { id: u.id, token, addressId: (await makeAddress(u.id)).id };
}
type Buyer = Awaited<ReturnType<typeof buyer>>;

async function place(b: Buyer, p?: Awaited<ReturnType<typeof makeProduct>>, qty = 1) {
  const product = p ?? (await makeProduct({ price: 250_000, stock: 10 }));
  await addItem({ userId: b.id }, { variantId: product.variants[0]!.id, quantity: qty });
  const res = await call(checkout.POST, { method: "POST", token: b.token, headers: { "idempotency-key": randomUUID() }, body: { addressId: b.addressId, paymentMethod: "COD" } });
  return { product, res, orderId: res.body.data?.order?.id as string };
}
const move = (token: string, id: string, status: string, extra: Record<string, unknown> = {}) => call(adminStatus.POST, { method: "POST", token, params: { id }, body: { status, ...extra } });
const artGet = (slug: string, file: string) => art.GET(new Request("http://localhost/x"), { params: Promise.resolve({ slug, file }) } as never);

describe("customer order access", () => {
  it("lets the owner read an order and tracking, and hides it from every other customer", async () => {
    const a = await buyer();
    const other = await buyer();
    const { orderId, res } = await place(a);
    const number = res.body.data.order.orderNumber as string;
    for (const id of [orderId, number]) {
      expect((await call(orderById.GET, { token: a.token, params: { id } })).status).toBe(200);
      const stranger = await call(orderById.GET, { token: other.token, params: { id } });
      expect(stranger.status).toBe(404); // not 403: the order's existence is not revealed
    }
    expect((await call(tracking.GET, { token: other.token, params: { id: orderId } })).status).toBe(404);
    expect((await call(orderById.GET, { params: { id: orderId } })).status).toBe(401);
    const list = await call(orderList.GET, { token: other.token });
    expect(list.body.data).toHaveLength(0);
  });
});

describe("checkout safety", () => {
  it("replaying the same Idempotency-Key never creates a second order", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 120_000, stock: 10 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id, quantity: 1 });
    const key = randomUUID();
    const send = () => call(checkout.POST, { method: "POST", token: b.token, headers: { "idempotency-key": key }, body: { addressId: b.addressId, paymentMethod: "COD" } });
    const r1 = await send();
    const r2 = await send();
    expect(r1.status).toBe(201);
    expect(r2.body.data.order.id).toBe(r1.body.data.order.id);
    expect(await db.order.count({ where: { userId: b.id } })).toBe(1);
  });

  it("does not clear the cart when order creation fails", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 120_000, stock: 1 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id, quantity: 1 });
    await db.inventory.updateMany({ where: { variantId: p.variants[0]!.id }, data: { quantity: 0 } }); // sold out meanwhile
    const res = await call(checkout.POST, { method: "POST", token: b.token, headers: { "idempotency-key": randomUUID() }, body: { addressId: b.addressId, paymentMethod: "COD" } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await db.order.count({ where: { userId: b.id } })).toBe(0);
    expect((await viewCart({ userId: b.id })).items).toHaveLength(1);
  });

  it("rejects a client-supplied total that no longer matches the server total", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 120_000, stock: 5 });
    await addItem({ userId: b.id }, { variantId: p.variants[0]!.id, quantity: 1 });
    const res = await call(checkout.POST, { method: "POST", token: b.token, headers: { "idempotency-key": randomUUID() }, body: { addressId: b.addressId, paymentMethod: "COD", expectedTotal: 1 } });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("PRICE_CHANGED");
  });
});

describe("product identity is preserved from catalogue to order", () => {
  it("the order line keeps the image that was bought, even after the catalogue image changes", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 300_000, stock: 5 });
    const url = (await db.productMedia.findFirstOrThrow({ where: { productId: p.id } })).url;
    const { orderId } = await place(b, p);
    const before = (await call(orderById.GET, { token: b.token, params: { id: orderId } })).body.data.items[0];
    expect(before.imageUrl).toBe(url);
    expect(before.productId).toBe(p.id);
    expect(before.sku).toBe(p.variants[0]!.sku);
    await db.productMedia.updateMany({ where: { productId: p.id }, data: { url: "/catalog/placeholders/laptops.svg" } });
    const after = (await call(orderById.GET, { token: b.token, params: { id: orderId } })).body.data.items[0];
    expect(after.imageUrl).toBe(url);
  });

  it("prefers the purchased variant's own image over the product's primary image", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 300_000, stock: 5 });
    await db.productMedia.create({ data: { productId: p.id, variantId: p.variants[0]!.id, url: "/media/art/variant-test/colour-111111.svg", alt: "variant", sortOrder: 5 } });
    const { orderId } = await place(b, p);
    const item = (await call(orderById.GET, { token: b.token, params: { id: orderId } })).body.data.items[0];
    expect(item.imageUrl).toBe("/media/art/variant-test/colour-111111.svg");
  });

  it("serves artwork only for mapped products and only for colours the product really has", async () => {
    const mapped = await makeProduct({ name: "Voltix Aero 14 Ultrabook", variants: [{ options: [{ key: "color", value: "Silver" }] }] });
    expect(mapped.slug).toBe("voltix-aero-14-ultrabook");
    await db.variantOptionValue.updateMany({ where: { variantId: mapped.variants[0]!.id }, data: { swatch: "#C9CCD1" } });
    const hero = await artGet(mapped.slug, "hero.svg");
    expect(hero.status).toBe(200);
    expect(hero.headers.get("content-type")).toContain("image/svg+xml");
    expect(await hero.text()).toContain("Voltix Aero 14 Ultrabook");
    expect((await artGet(mapped.slug, "colour-c9ccd1.svg")).status).toBe(200);
    expect((await artGet(mapped.slug, "colour-ff0000.svg")).status).toBe(404);
    expect((await artGet(mapped.slug, "../../etc.svg")).status).toBe(404);
    const unmapped = await makeProduct({ name: "Unmapped Gadget" });
    expect((await artGet(unmapped.slug, "hero.svg")).status).toBe(404);
    expect(productArtUrl(mapped.slug, "hero")).toBe(`/media/art/${mapped.slug}/hero.svg`);
  });
});

describe("customer → admin order lifecycle", () => {
  it("a new order shows up for staff in the list and the live queues; customers get no staff data", async () => {
    const b = await buyer();
    const ops = await staffSession("order_manager");
    const before = (await call(adminQueues.GET, { token: ops.token })).body.data;
    const { orderId, res } = await place(b);
    const list = await call(adminOrders.GET, { token: ops.token, query: { search: res.body.data.order.orderNumber } });
    expect(list.body.data.map((o: { id: string }) => o.id)).toContain(orderId);
    const after = (await call(adminQueues.GET, { token: ops.token, query: { since: new Date(Date.now() - 60_000).toISOString() } })).body.data;
    expect(after.queues.toConfirm).toBe(before.queues.toConfirm + 1);
    expect(after.newOrdersSince).toBeGreaterThanOrEqual(1);
    expect(after.recentOrders.map((o: { id: string }) => o.id)).toContain(orderId);
    expect((await call(adminQueues.GET, { token: b.token })).status).toBe(403);
    expect((await call(adminOrders.GET, { token: b.token })).status).toBe(403);
    expect((await call(adminQueues.GET, {})).status).toBe(401);
  });

  it("enforces transition rules and documentation requirements, and records the actor", async () => {
    const b = await buyer();
    const ops = await staffSession("order_manager");
    const { orderId } = await place(b);
    expect((await move(ops.token, orderId, "SHIPPED", { note: "x" })).status).toBe(409); // skipping stages
    expect((await move(ops.token, orderId, "PAID")).status).toBe(422); // not an order status at all
    expect((await move(ops.token, orderId, "CONFIRMED")).status).toBe(200);
    expect((await move(ops.token, orderId, "PROCESSING")).status).toBe(200);
    expect((await move(ops.token, orderId, "PACKED")).status).toBe(200);
    expect((await move(ops.token, orderId, "SHIPPED")).status).toBe(422); // no shipment and no documented manual procedure
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PACKED");
    const ship = await call(shipments.POST, { method: "POST", token: ops.token, params: { id: orderId }, body: { carrier: "Delhivery", trackingNumber: "DLV123456" } });
    expect(ship.status).toBeLessThan(300);
    expect((await move(ops.token, orderId, "DELIVERED")).status).toBe(422); // neither a carrier delivery event nor proof of delivery
    const history = await db.orderStatusHistory.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => h.toStatus)).toEqual(["PENDING_PAYMENT", "PLACED", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED"]);
    expect(history.slice(2).every((h) => h.actorId === ops.row.id)).toBe(true);
    expect((await move(ops.token, orderId, "DELIVERED", { note: "Signed for by recipient (POD #88)" })).status).toBe(200);
  });

  it("carrier events flow through to the customer's order, tracking and order list", async () => {
    const b = await buyer();
    const ops = await staffSession("order_manager");
    const { orderId } = await place(b);
    for (const s of ["CONFIRMED", "PROCESSING", "PACKED"]) await move(ops.token, orderId, s);
    const ship = await call(shipments.POST, { method: "POST", token: ops.token, params: { id: orderId }, body: { carrier: "Delhivery", trackingNumber: "DLV987" } });
    const shipmentId = ship.body.data.id as string;
    let order = (await call(orderById.GET, { token: b.token, params: { id: orderId } })).body.data;
    expect(order.status).toBe("SHIPPED");
    expect(order.tracking.shipments[0]).toMatchObject({ carrier: "Delhivery", trackingNumber: "DLV987" });

    await call(shipmentUpdate.PATCH, { method: "PATCH", token: ops.token, params: { id: shipmentId }, body: { status: "REACHED_HUB", location: "Pune Hub" } });
    const t = (await call(tracking.GET, { token: b.token, params: { id: orderId } })).body.data;
    expect(t.events.some((e: { location: string; shipmentId: string }) => e.location === "Pune Hub" && e.shipmentId)).toBe(true);

    await call(shipmentUpdate.PATCH, { method: "PATCH", token: ops.token, params: { id: shipmentId }, body: { status: "DELIVERED" } });
    order = (await call(orderById.GET, { token: b.token, params: { id: orderId } })).body.data;
    expect(order.status).toBe("DELIVERED");
    expect(order.paymentStatus).toBe("PAID"); // COD cash is captured on delivery
    expect(order.tracking.progress.at(-1)).toMatchObject({ status: "DELIVERED", state: "completed" });
    const row = (await call(orderList.GET, { token: b.token })).body.data.find((o: { id: string }) => o.id === orderId);
    expect(row.shipments[0]).toMatchObject({ status: "DELIVERED", trackingNumber: "DLV987" });
    expect(row.statusLabel).toBe("Delivered");
  });

  it("a customer cancellation is reflected for both sides and releases the stock", async () => {
    const b = await buyer();
    const p = await makeProduct({ price: 100_000, stock: 3 });
    const { orderId } = await place(b, p, 2);
    const cancel = await call(orderCancel.POST, { method: "POST", token: b.token, params: { id: orderId }, body: { reason: "Changed my mind" } });
    expect(cancel.status).toBe(200);
    const order = (await call(orderById.GET, { token: b.token, params: { id: orderId } })).body.data;
    expect(order.status).toBe("CANCELLED");
    expect(order.tracking.progress.find((s: { status: string }) => s.status === "SHIPPED").state).toBe("skipped");
    const inv = await db.inventory.findUniqueOrThrow({ where: { variantId: p.variants[0]!.id } });
    expect(inv.quantity - inv.reserved).toBe(3);
    const ops = await staffSession("order_manager");
    expect((await move(ops.token, orderId, "CONFIRMED")).status).toBe(409);
  });
});
