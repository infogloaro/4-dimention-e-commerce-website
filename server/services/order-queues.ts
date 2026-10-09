import { db } from "../db/client";

/**
 * Live (uncached) operational view for the admin order desk: work queues, exceptions and "what's new since I last looked".
 * Everything is a COUNT or a short list derived from the same tables the order pages use — no separate state to drift.
 */
export async function orderQueues(since?: Date) {
  const day = new Date(Date.now() - 86_400_000);
  const week = new Date(Date.now() - 7 * 86_400_000);
  const [byStatus, awaitingPaymentFailed, lateCaptures, mismatches, shipmentExceptions, returnRequests, returnsInFlight, refundsFailed, refundsPending, notificationFailures, webhookFailures, recent, newSince] = await Promise.all([
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.count({ where: { status: "PENDING_PAYMENT", paymentStatus: "FAILED" } }),
    db.order.count({ where: { status: "CANCELLED", paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] }, refundedTotal: { lt: 1 } } }),
    db.payment.count({ where: { failureCode: "amount_mismatch", createdAt: { gte: week } } }),
    db.shipment.count({ where: { status: { in: ["FAILED_DELIVERY", "RETURNED_TO_SENDER"] } } }),
    db.returnRequest.count({ where: { status: "REQUESTED" } }),
    db.returnRequest.count({ where: { status: { in: ["APPROVED", "PICKUP_SCHEDULED", "PICKED_UP", "RECEIVED", "REFUND_PENDING"] } } }),
    db.refund.count({ where: { status: "FAILED" } }),
    db.refund.count({ where: { status: { in: ["PENDING", "PROCESSING"] }, createdAt: { lt: day } } }),
    db.notificationDelivery.count({ where: { status: "FAILED", createdAt: { gte: week } } }),
    db.webhookEvent.count({ where: { status: "FAILED", receivedAt: { gte: week } } }),
    db.order.findMany({ where: { status: { not: "FAILED" } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, orderNumber: true, status: true, paymentStatus: true, grandTotal: true, customerName: true, createdAt: true } }),
    since ? db.order.count({ where: { createdAt: { gt: since }, status: { not: "FAILED" } } }) : Promise.resolve(0),
  ]);
  const n = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  return {
    generatedAt: new Date(),
    newOrdersSince: newSince,
    counts: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Record<string, number>,
    queues: {
      toConfirm: n("PLACED"),
      processing: n("CONFIRMED") + n("PROCESSING"),
      packing: n("PROCESSING"),
      readyToShip: n("PACKED"),
      inTransit: n("SHIPPED") + n("OUT_FOR_DELIVERY"),
    },
    attention: {
      pendingPayment: n("PENDING_PAYMENT"),
      paymentFailed: awaitingPaymentFailed,
      manualReview: lateCaptures + mismatches, // money received for a cancelled order, or an amount that didn't match
      shipmentExceptions,
      returnRequests,
      returnsInFlight,
      refundIssues: refundsFailed + refundsPending, // failed, or still unsettled after 24 h
      failedFulfilmentActions: notificationFailures + webhookFailures,
    },
    recentOrders: recent,
  };
}
