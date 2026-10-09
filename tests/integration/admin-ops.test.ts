import { beforeAll, describe, expect, it } from "vitest";
import { call } from "../support/api";
import { bootstrap, createUser, staffSession } from "../support/fixtures";
import { db } from "@/server/db/client";
import * as payments from "@/app/api/v1/admin/payments/route";
import * as refunds from "@/app/api/v1/admin/refunds/route";
import * as shipments from "@/app/api/v1/admin/shipments/route";
import * as deliveries from "@/app/api/v1/admin/notification-deliveries/route";
import * as system from "@/app/api/v1/admin/system/route";
import * as webhooks from "@/app/api/v1/admin/payments/webhooks/route";

beforeAll(bootstrap);

describe("admin operational views", () => {
  it("denies customers and anonymous callers", async () => {
    const customer = await createUser({ role: "customer", email: "ops-cust@example.com" });
    const { sessionFor } = await import("../support/fixtures");
    const tok = (await sessionFor(customer.id)).token;
    for (const h of [payments.GET, refunds.GET, shipments.GET, deliveries.GET, system.GET, webhooks.GET]) {
      expect((await call(h, {})).status).toBe(401);
      expect((await call(h, { token: tok })).status).toBe(403);
    }
  });

  it("masks notification recipients and never returns payloads", async () => {
    await db.notificationDelivery.create({ data: { channel: "EMAIL", recipient: "secret.person@example.com", template: "order.placed", payload: { token: "do-not-leak" }, status: "SENT" } });
    await db.notificationDelivery.create({ data: { channel: "SMS", recipient: "+919810000000", template: "order.placed", payload: {}, status: "FAILED", error: "boom" } });
    const tok = (await staffSession("manager")).token;
    const r = await call(deliveries.GET, { token: tok });
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain("secret.person");
    expect(text).not.toContain("do-not-leak");
    expect(text).not.toContain("+919810000000");
    expect(r.body.data.some((d: { recipient: string }) => d.recipient === "s***@example.com")).toBe(true);
    const failed = await call(deliveries.GET, { token: tok, query: { status: "FAILED" } });
    expect(failed.body.data.every((d: { status: string }) => d.status === "FAILED")).toBe(true);
  });

  it("system health reports readiness without exposing secrets", async () => {
    const tok = (await staffSession("admin")).token;
    const r = await call(system.GET, { token: tok });
    expect(r.status).toBe(200);
    expect(r.body.data.database.status).toBe("up");
    const text = JSON.stringify(r.body);
    for (const v of [process.env.AUTH_SECRET, process.env.PAYMENT_WEBHOOK_SECRET, process.env.RAZORPAY_KEY_SECRET, process.env.STRIPE_SECRET_KEY]) if (v) expect(text).not.toContain(v);
    const carrier = r.body.data.integrations.find((i: { key: string }) => i.key === "shipping");
    expect(carrier.state).toBe("not_configured"); // no carrier API exists — must never be reported as operational
  });

  it("payment, refund and shipment lists validate filters and paginate", async () => {
    const tok = (await staffSession("order_manager")).token;
    expect((await call(payments.GET, { token: tok, query: { status: "BOGUS" } })).status).toBe(422);
    const p = await call(payments.GET, { token: tok, query: { pageSize: "5" } });
    expect(p.status).toBe(200);
    expect(p.body.meta.pageSize).toBe(5);
    expect(JSON.stringify(p.body)).not.toContain("clientPayload");
    expect((await call(refunds.GET, { token: tok, query: { status: "PENDING" } })).status).toBe(200);
    const s = await call(shipments.GET, { token: tok, query: { exceptions: "true" } });
    expect(s.status).toBe(200);
    expect(s.body.data.every((x: { status: string }) => ["FAILED_DELIVERY", "RETURNED_TO_SENDER"].includes(x.status))).toBe(true);
  });

  it("an inventory manager (no order permissions) cannot read payments", async () => {
    const tok = (await staffSession("inventory_manager")).token;
    expect((await call(payments.GET, { token: tok })).status).toBe(403);
  });
});
