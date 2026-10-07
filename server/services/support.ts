import { db, Prisma, withTransaction } from "../db/client";
import { notFound } from "../core/errors";
import { randomCode } from "../core/text";
import type { AuthUser } from "../auth/session";
import { audit } from "./audit";
import { notify } from "./notifications";
import type { TicketStatus } from "../db/generated/client";

export async function createTicket(user: AuthUser, input: { subject: string; message: string; category: string; orderId?: string }) {
  if (input.orderId && !(await db.order.findFirst({ where: { id: input.orderId, userId: user.id }, select: { id: true } }))) throw notFound("ORDER_NOT_FOUND", "Order");
  const t = await db.supportTicket.create({
    data: { number: `TKT-${randomCode(7)}`, userId: user.id, subject: input.subject, category: input.category, orderId: input.orderId, messages: { create: { authorId: user.id, body: input.message } } },
    include: { messages: true },
  });
  return t;
}

export async function listMyTickets(userId: string, page: number, pageSize: number) {
  const where = { userId };
  const [items, total] = await Promise.all([db.supportTicket.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { messages: true } } } }), db.supportTicket.count({ where })]);
  return { items, total };
}

export async function getMyTicket(userId: string, id: string) {
  const t = await db.supportTicket.findFirst({ where: { id, userId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!t) throw notFound("TICKET_NOT_FOUND", "Ticket");
  return t;
}

export async function customerReply(user: AuthUser, id: string, message: string) {
  const t = await db.supportTicket.findFirst({ where: { id, userId: user.id } });
  if (!t) throw notFound("TICKET_NOT_FOUND", "Ticket");
  await withTransaction(async (tx) => {
    await tx.ticketMessage.create({ data: { ticketId: id, authorId: user.id, body: message } });
    await tx.supportTicket.update({ where: { id }, data: { status: "OPEN" } });
  });
  return getMyTicket(user.id, id);
}

// ── staff ──
export async function adminListTickets(q: { status?: TicketStatus; search?: string; page: number; pageSize: number }) {
  const where: Prisma.SupportTicketWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.search ? { OR: [{ number: { contains: q.search.toUpperCase() } }, { subject: { contains: q.search, mode: "insensitive" } }] } : {}) };
  const [items, total] = await Promise.all([db.supportTicket.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { user: { select: { name: true, email: true } }, _count: { select: { messages: true } } } }), db.supportTicket.count({ where })]);
  return { items, total };
}

export async function adminGetTicket(id: string) {
  const t = await db.supportTicket.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, email: true } }, messages: { orderBy: { createdAt: "asc" } } } });
  if (!t) throw notFound("TICKET_NOT_FOUND", "Ticket");
  return t;
}

export async function staffReply(actor: AuthUser, id: string, message: string, status?: TicketStatus) {
  const t = await db.supportTicket.findUnique({ where: { id }, include: { user: { select: { id: true, email: true } } } });
  if (!t) throw notFound("TICKET_NOT_FOUND", "Ticket");
  await withTransaction(async (tx) => {
    await tx.ticketMessage.create({ data: { ticketId: id, authorId: actor.id, isStaff: true, body: message } });
    await tx.supportTicket.update({ where: { id }, data: { status: status ?? "PENDING_CUSTOMER", assignedToId: t.assignedToId ?? actor.id } });
  });
  await notify("ticket.reply", { userId: t.user.id, email: t.user.email }, { number: t.number });
  await audit({ action: "ticket.replied", resourceType: "ticket", resourceId: id, actor });
  return adminGetTicket(id);
}

export async function setTicketStatus(actor: AuthUser, id: string, status: TicketStatus) {
  const res = await db.supportTicket.updateMany({ where: { id }, data: { status } });
  if (res.count === 0) throw notFound("TICKET_NOT_FOUND", "Ticket");
  await audit({ action: "ticket.status_changed", resourceType: "ticket", resourceId: id, actor, metadata: { status } });
}
