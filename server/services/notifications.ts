import { db } from "../db/client";
import { env } from "../core/env";
import { logger } from "../core/logger";
import { getProvider } from "../integrations/notifications/providers";
import type { NotificationChannel, Prisma } from "../db/generated/client";

export interface NotifyTarget {
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
}

type Channels = Partial<Record<"inApp" | "email" | "sms" | "whatsapp", boolean>>;

interface Template {
  title: string;
  body: string;
  emailSubject?: string;
  channels: Channels;
  /** Template fields that are secrets (tokens, OTPs): kept out of the persisted outbox payload. */
  sensitive?: string[];
}

type Data = Record<string, string | number | undefined>;

const money = (minor: number | string | undefined) =>
  `${env.STORE_CURRENCY} ${(Number(minor ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const T: Record<string, (d: Data) => Template> = {
  "account.created": (d) => ({
    title: "Welcome to 4D Commerce",
    body: `Hi ${d.name}, your account is ready. Start exploring.`,
    channels: { inApp: true, email: true },
  }),
  "email.verification": (d) => ({
    title: "Verify your email",
    emailSubject: "Verify your email address",
    body: `Confirm your email with this link: ${env.APP_URL}/verify-email?token=${d.token}`,
    channels: { email: true },
    sensitive: ["token"],
  }),
  "password.reset": (d) => ({
    title: "Reset your password",
    emailSubject: "Reset your password",
    body: `Use this link to reset your password (valid for 1 hour): ${env.APP_URL}/reset-password?token=${d.token}. If you didn't ask for this, ignore this email.`,
    channels: { email: true },
    sensitive: ["token"],
  }),
  "password.changed": () => ({
    title: "Password changed",
    emailSubject: "Your password was changed",
    body: "Your password was just changed. If this wasn't you, reset it immediately and contact support.",
    channels: { inApp: true, email: true },
  }),
  "phone.otp": (d) => ({
    title: "Your verification code",
    body: `Your 4D Commerce verification code is ${d.code}. It expires in 10 minutes.`,
    channels: { sms: true },
    sensitive: ["code"],
  }),
  "order.placed": (d) => ({
    title: `Order ${d.orderNumber} placed`,
    emailSubject: `Order confirmation ${d.orderNumber}`,
    body: `Thanks for your order! ${d.orderNumber} totalling ${money(d.total)} is confirmed.`,
    channels: { inApp: true, email: true, sms: true, whatsapp: true },
  }),
  "payment.succeeded": (d) => ({
    title: "Payment received",
    body: `We received ${money(d.amount)} for order ${d.orderNumber}.`,
    channels: { inApp: true, email: true },
  }),
  "payment.failed": (d) => ({
    title: "Payment failed",
    body: `Payment for order ${d.orderNumber} did not go through. You can retry from your orders page.`,
    channels: { inApp: true, email: true },
  }),
  "order.shipped": (d) => ({
    title: `Order ${d.orderNumber} shipped`,
    body: `Your order is on its way${d.carrier ? ` with ${d.carrier}` : ""}${d.trackingNumber ? ` (tracking ${d.trackingNumber})` : ""}.`,
    channels: { inApp: true, email: true, sms: true, whatsapp: true },
  }),
  "order.out_for_delivery": (d) => ({
    title: `Order ${d.orderNumber} is out for delivery`,
    body: "Your package will arrive today.",
    channels: { inApp: true, sms: true, whatsapp: true },
  }),
  "order.delivered": (d) => ({
    title: `Order ${d.orderNumber} delivered`,
    body: "Your order has been delivered. We'd love your review!",
    channels: { inApp: true, email: true, whatsapp: true },
  }),
  "order.cancelled": (d) => ({
    title: `Order ${d.orderNumber} cancelled`,
    body: `Your order was cancelled${d.reason ? `: ${d.reason}` : ""}. Any payment will be refunded.`,
    channels: { inApp: true, email: true },
  }),
  "return.requested": (d) => ({
    title: `Return ${d.number} received`,
    body: "We've received your return request and will review it shortly.",
    channels: { inApp: true, email: true },
  }),
  "return.approved": (d) => ({
    title: `Return ${d.number} approved`,
    body: "Your return was approved. We'll arrange the pickup.",
    channels: { inApp: true, email: true, sms: true },
  }),
  "return.rejected": (d) => ({
    title: `Return ${d.number} not approved`,
    body: `Your return request was declined${d.note ? `: ${d.note}` : ""}.`,
    channels: { inApp: true, email: true },
  }),
  "refund.processed": (d) => ({
    title: "Refund processed",
    body: `A refund of ${money(d.amount)} for order ${d.orderNumber} has been processed.`,
    channels: { inApp: true, email: true, sms: true },
  }),
  "review.approved": (d) => ({
    title: "Your review is live",
    body: `Thanks for reviewing ${d.product}.`,
    channels: { inApp: true },
  }),
  "ticket.reply": (d) => ({
    title: `Update on ticket ${d.number}`,
    body: "Our support team replied to your ticket.",
    channels: { inApp: true, email: true },
  }),
  "promo.generic": (d) => ({
    title: String(d.title ?? "A special offer for you"),
    body: String(d.body ?? ""),
    channels: { inApp: true, email: true },
  }),
};

export type NotificationEvent = keyof typeof T;
export const NOTIFICATION_EVENTS = Object.keys(T);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function deliver(
  channel: Exclude<NotificationChannel, "IN_APP">,
  recipient: string,
  event: string,
  tpl: Template,
  data: Data,
  userId?: string | null,
) {
  const stored: Prisma.InputJsonObject = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, tpl.sensitive?.includes(k) ? "[redacted]" : (v ?? null)]),
  );
  const row = await db.notificationDelivery.create({
    data: { channel, recipient, template: event, payload: stored, userId: userId ?? undefined },
  });
  try {
    const provider = getProvider(channel.toLowerCase() as "email" | "sms" | "whatsapp");
    const res = await provider.send({
      to: recipient,
      subject: tpl.emailSubject ?? tpl.title,
      text: tpl.body,
      html: channel === "EMAIL" ? `<p>${escapeHtml(tpl.body).replace(/\n/g, "<br>")}</p>` : undefined,
      template: event,
      data,
    });
    await db.notificationDelivery.update({
      where: { id: row.id },
      data: { status: "SENT", provider: provider.name, providerRef: res.providerRef, attempts: 1, sentAt: new Date() },
    });
  } catch (e) {
    logger.warn("notification delivery failed", { channel, event, error: e instanceof Error ? e.message : String(e) });
    await db.notificationDelivery.update({
      where: { id: row.id },
      data: { status: "FAILED", attempts: 1, error: (e instanceof Error ? e.message : "send failed").slice(0, 500) },
    });
  }
}

/**
 * Fan an event out to in-app + email/SMS/WhatsApp. Never throws: a failed notification must never fail an order.
 */
export async function notify(event: NotificationEvent, target: NotifyTarget, data: Data = {}): Promise<void> {
  try {
    const tpl = T[event]?.(data);
    if (!tpl) return;
    const jobs: Promise<unknown>[] = [];

    if (tpl.channels.inApp && target.userId) {
      jobs.push(
        db.notification.create({
          data: { userId: target.userId, type: event, title: tpl.title, body: tpl.body, data: stripSensitive(data, tpl) },
        }),
      );
    }
    if (tpl.channels.email && target.email) jobs.push(deliver("EMAIL", target.email, event, tpl, data, target.userId));
    if (tpl.channels.sms && target.phone) jobs.push(deliver("SMS", target.phone, event, tpl, data, target.userId));
    if (tpl.channels.whatsapp && target.phone) jobs.push(deliver("WHATSAPP", target.phone, event, tpl, data, target.userId));
    await Promise.allSettled(jobs);
  } catch (e) {
    logger.error("notify failed", { event, error: e instanceof Error ? e.message : String(e) });
  }
}

function stripSensitive(data: Data, tpl: Template): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(data).filter(([k]) => !tpl.sensitive?.includes(k)).map(([k, v]) => [k, v ?? null]));
}

// ── in-app notification centre ──

export async function listNotifications(userId: string, opts: { page: number; pageSize: number; unreadOnly?: boolean }) {
  const where = { userId, ...(opts.unreadOnly ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, total, unread };
}

export async function markRead(userId: string, ids?: string[]) {
  const res = await db.notification.updateMany({
    where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return { updated: res.count };
}
