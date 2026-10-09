import { z } from "zod";
import { db, Prisma } from "../db/client";
import { env } from "../core/env";
import { paginationSchemaRef } from "../validation/common";
import type { DeliveryStatus, PaymentAttemptStatus, PaymentProviderKey, RefundStatus, ShipmentStatus, WebhookStatus } from "../db/generated/client";

/**
 * Read-only operational views for the admin console: payments, refunds, shipments, webhook events,
 * notification deliveries and integration health. None of them exposes card data, provider secrets,
 * raw webhook payloads or provider client payloads.
 */

const dateRange = { from: z.coerce.date().optional(), to: z.coerce.date().optional() };
const range = (q: { from?: Date; to?: Date }) => (q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {});

// ── payments ──
export const adminPaymentsQuery = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(["CREATED", "REQUIRES_ACTION", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED"]).optional(),
  provider: z.enum(["COD", "RAZORPAY", "STRIPE", "MOCK"]).optional(),
  ...dateRange,
  ...paginationSchemaRef,
});

export async function adminListPayments(q: z.infer<typeof adminPaymentsQuery>) {
  const where: Prisma.PaymentWhereInput = {
    ...(q.status ? { status: q.status as PaymentAttemptStatus } : {}),
    ...(q.provider ? { provider: q.provider as PaymentProviderKey } : {}),
    ...range(q),
    ...(q.search ? { OR: [{ providerPaymentId: { contains: q.search } }, { providerChargeId: { contains: q.search } }, { order: { orderNumber: { contains: q.search.toUpperCase() } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.payment.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      select: { id: true, orderId: true, provider: true, method: true, status: true, amount: true, currency: true, providerPaymentId: true, providerChargeId: true, failureCode: true, failureReason: true, paidAt: true, createdAt: true, order: { select: { orderNumber: true, paymentStatus: true, customerName: true } } },
    }),
    db.payment.count({ where }),
  ]);
  return { items, total };
}

// ── webhook events (duplicates/failures surface here) ──
export const adminWebhooksQuery = z.object({ status: z.enum(["RECEIVED", "PROCESSED", "IGNORED", "FAILED"]).optional(), provider: z.enum(["COD", "RAZORPAY", "STRIPE", "MOCK"]).optional(), ...paginationSchemaRef });
export async function adminListWebhookEvents(q: z.infer<typeof adminWebhooksQuery>) {
  const where: Prisma.WebhookEventWhereInput = { ...(q.status ? { status: q.status as WebhookStatus } : {}), ...(q.provider ? { provider: q.provider as PaymentProviderKey } : {}) };
  const [items, total] = await Promise.all([
    db.webhookEvent.findMany({ where, orderBy: { receivedAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, provider: true, eventId: true, type: true, status: true, error: true, receivedAt: true, processedAt: true } }),
    db.webhookEvent.count({ where }),
  ]);
  return { items, total };
}

// ── refunds ──
export const adminRefundsQuery = z.object({ status: z.enum(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED"]).optional(), search: z.string().trim().max(80).optional(), ...dateRange, ...paginationSchemaRef });
export async function adminListRefunds(q: z.infer<typeof adminRefundsQuery>) {
  const where: Prisma.RefundWhereInput = {
    ...(q.status ? { status: q.status as RefundStatus } : {}),
    ...range(q),
    ...(q.search ? { OR: [{ order: { orderNumber: { contains: q.search.toUpperCase() } } }, { providerRefundId: { contains: q.search } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.refund.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      select: { id: true, orderId: true, paymentId: true, returnRequestId: true, amount: true, status: true, reason: true, providerRefundId: true, failureReason: true, processedAt: true, createdAt: true, order: { select: { orderNumber: true, currency: true, grandTotal: true, refundedTotal: true } }, payment: { select: { provider: true, method: true } } },
    }),
    db.refund.count({ where }),
  ]);
  return { items, total };
}

// ── shipments ──
export const adminShipmentsQuery = z.object({
  status: z.enum(["PENDING", "LABEL_CREATED", "PICKED_UP", "IN_TRANSIT", "REACHED_HUB", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED_DELIVERY", "RETURNED_TO_SENDER"]).optional(),
  search: z.string().trim().max(80).optional(),
  missingTracking: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  exceptions: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  ...dateRange,
  ...paginationSchemaRef,
});
export async function adminListShipments(q: z.infer<typeof adminShipmentsQuery>) {
  const where: Prisma.ShipmentWhereInput = {
    ...(q.status ? { status: q.status as ShipmentStatus } : {}),
    ...(q.exceptions ? { status: { in: ["FAILED_DELIVERY", "RETURNED_TO_SENDER"] as ShipmentStatus[] } } : {}),
    ...(q.missingTracking ? { OR: [{ trackingNumber: null }, { trackingNumber: "" }], status: { notIn: ["DELIVERED", "PENDING"] as ShipmentStatus[] } } : {}),
    ...range(q),
    ...(q.search ? { AND: [{ OR: [{ trackingNumber: { contains: q.search } }, { carrier: { contains: q.search, mode: "insensitive" } }, { order: { orderNumber: { contains: q.search.toUpperCase() } } }] }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.shipment.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      select: { id: true, orderId: true, carrier: true, trackingNumber: true, trackingUrl: true, status: true, shippedAt: true, estimatedDelivery: true, deliveredAt: true, createdAt: true, updatedAt: true, order: { select: { orderNumber: true, status: true, customerName: true } }, events: { orderBy: { occurredAt: "desc" }, take: 1, select: { title: true, location: true, occurredAt: true } } },
    }),
    db.shipment.count({ where }),
  ]);
  return { items, total };
}

// ── notification outbox (no payloads: they contain customer data) ──
export const adminDeliveriesQuery = z.object({ status: z.enum(["QUEUED", "SENT", "FAILED", "SKIPPED"]).optional(), channel: z.enum(["EMAIL", "SMS", "WHATSAPP"]).optional(), ...paginationSchemaRef });
export async function adminListDeliveries(q: z.infer<typeof adminDeliveriesQuery>) {
  const where: Prisma.NotificationDeliveryWhereInput = { ...(q.status ? { status: q.status as DeliveryStatus } : {}), ...(q.channel ? { channel: q.channel } : {}) };
  const [rows, total] = await Promise.all([
    db.notificationDelivery.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, channel: true, recipient: true, template: true, status: true, provider: true, providerRef: true, attempts: true, error: true, createdAt: true, sentAt: true } }),
    db.notificationDelivery.count({ where }),
  ]);
  // Mask recipients (a@b.com → a***@b.com, +9198… → ******4321) so the log is useful without being a contact export.
  const mask = (r: string) => (r.includes("@") ? r.replace(/^(.).*(@.*)$/, "$1***$2") : r.length > 4 ? `${"*".repeat(r.length - 4)}${r.slice(-4)}` : "****");
  return { items: rows.map((r) => ({ ...r, recipient: mask(r.recipient) })), total };
}

// ── integration & system health ──
const set = (v: string | undefined) => !!v && v.trim().length > 0;
export type IntegrationState = "configured" | "not_configured" | "development_only";

export async function systemHealth() {
  const started = Date.now();
  let dbUp = true;
  try { await db.$queryRaw`SELECT 1`; } catch { dbUp = false; }
  const latencyMs = Date.now() - started;
  const day = new Date(Date.now() - 86_400_000);
  const stale = new Date(Date.now() - 30 * 60_000);
  const [failedWebhooks, failedDeliveries, queuedDeliveries, stuckPayments, failedRefunds, pendingRefunds] = dbUp
    ? await Promise.all([
        db.webhookEvent.count({ where: { status: "FAILED", receivedAt: { gte: day } } }),
        db.notificationDelivery.count({ where: { status: "FAILED", createdAt: { gte: day } } }),
        db.notificationDelivery.count({ where: { status: "QUEUED" } }),
        db.payment.count({ where: { status: { in: ["CREATED", "REQUIRES_ACTION"] }, provider: { not: "COD" }, createdAt: { lt: stale } } }),
        db.refund.count({ where: { status: "FAILED" } }),
        db.refund.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
      ])
    : [0, 0, 0, 0, 0, 0];

  const payState: IntegrationState = env.PAYMENT_PROVIDER === "mock" ? "development_only"
    : env.PAYMENT_PROVIDER === "razorpay" ? (set(env.RAZORPAY_KEY_ID) && set(env.RAZORPAY_KEY_SECRET) && set(env.RAZORPAY_WEBHOOK_SECRET) ? "configured" : "not_configured")
    : set(env.STRIPE_SECRET_KEY) && set(env.STRIPE_WEBHOOK_SECRET) ? "configured" : "not_configured";
  const storageState: IntegrationState = env.STORAGE_PROVIDER === "local" ? "development_only" : env.STORAGE_PROVIDER === "s3" ? (set(env.STORAGE_BUCKET) && set(env.STORAGE_ACCESS_KEY) && set(env.STORAGE_SECRET_KEY) ? "configured" : "not_configured") : set(process.env.CLOUDINARY_URL) ? "configured" : "not_configured";
  const channel = (provider: string, key: string): IntegrationState => (provider === "console" ? "development_only" : set(key) ? "configured" : "not_configured");

  return {
    time: new Date().toISOString(),
    environment: env.NODE_ENV,
    database: { status: dbUp ? "up" : "down", latencyMs },
    // Secrets are never returned — only whether each integration has what it needs. "configured" means credentials are present, not that a live call was verified.
    integrations: [
      { key: "payments", label: `Payments (${env.PAYMENT_PROVIDER})`, state: payState, note: payState === "development_only" ? "Mock provider: payments are simulated and must never be treated as real money." : payState === "configured" ? "Credentials present; not verified against the live provider by this check." : "Required credentials are missing." },
      { key: "storage", label: `Media storage (${env.STORAGE_PROVIDER})`, state: storageState, note: storageState === "development_only" ? "Local disk under /public/uploads — not suitable for multi-instance production." : undefined },
      { key: "email", label: `Email (${env.EMAIL_PROVIDER})`, state: channel(env.EMAIL_PROVIDER, env.EMAIL_API_KEY), note: env.EMAIL_PROVIDER === "console" ? "Console provider: messages are logged, not delivered." : undefined },
      { key: "sms", label: `SMS (${env.SMS_PROVIDER})`, state: channel(env.SMS_PROVIDER, env.SMS_API_KEY), note: env.SMS_PROVIDER === "console" ? "Console provider: messages are logged, not delivered." : undefined },
      { key: "whatsapp", label: `WhatsApp (${env.WHATSAPP_PROVIDER})`, state: channel(env.WHATSAPP_PROVIDER, env.WHATSAPP_API_KEY), note: env.WHATSAPP_PROVIDER === "console" ? "Console provider: messages are logged, not delivered." : undefined },
      { key: "shipping", label: "Carrier integration", state: "not_configured" as IntegrationState, note: "No carrier API is integrated. Shipment creation, labels and tracking are entered manually by staff." },
    ],
    signals: { failedWebhooks24h: failedWebhooks, failedDeliveries24h: failedDeliveries, queuedDeliveries, stuckPayments, failedRefunds, pendingRefunds },
  };
}
