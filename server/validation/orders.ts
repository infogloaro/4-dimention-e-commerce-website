import { z } from "zod";
import { arrayParam, id, mediaUrl, paginationSchemaRef, plainText } from "./common";

const orderStatus = z.enum(["PENDING_PAYMENT", "PLACED", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "FAILED", "RETURN_REQUESTED", "RETURNED"]);

export const listOrdersQuery = z.object({ status: arrayParam(orderStatus).optional(), search: z.string().trim().max(80).optional(), ...paginationSchemaRef, pageSize: z.coerce.number().int().min(1).max(50).default(10) });
export const cancelOrderBody = z.object({ reason: plainText(300, 3).default("Changed my mind") });

export const returnBody = z.object({
  items: z.array(z.object({ orderItemId: id, quantity: z.number().int().min(1).max(100), reason: plainText(200).optional() })).min(1).max(50),
  reason: plainText(200, 3),
  details: plainText(1000).optional(),
  resolution: z.enum(["REFUND", "REPLACEMENT"]).default("REFUND"),
  evidenceUrls: z.array(mediaUrl).max(5).optional(),
});

export const reviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  title: plainText(120).optional(),
  body: plainText(3000).optional(),
  imageUrls: z.array(mediaUrl).max(5).optional(),
});
export const updateReviewBody = reviewBody.omit({ imageUrls: true }).partial();
export const reviewListQuery = z.object({
  sort: z.enum(["recent", "helpful", "rating_desc", "rating_asc"]).default("recent"),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  verifiedOnly: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  ...paginationSchemaRef,
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export const questionBody = z.object({ question: plainText(500, 5) });

export const ticketBody = z.object({ subject: plainText(160, 3), message: plainText(4000, 3), category: z.enum(["general", "order", "payment", "return", "account", "product"]).default("general"), orderId: id.optional() });
export const ticketReplyBody = z.object({ message: plainText(4000, 1) });

// ── staff ──
export const transitionBody = z.object({ status: orderStatus, note: plainText(300).optional(), location: plainText(120).optional(), reason: plainText(300).optional() });
export const shipmentBody = z.object({ carrier: plainText(80).optional(), trackingNumber: plainText(80).optional(), trackingUrl: z.string().url().optional(), estimatedDelivery: z.coerce.date().optional(), items: z.array(z.object({ orderItemId: id, quantity: z.number().int().min(1) })).optional() });
export const shipmentUpdateBody = z.object({ status: z.enum(["PENDING", "LABEL_CREATED", "PICKED_UP", "IN_TRANSIT", "REACHED_HUB", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED_DELIVERY", "RETURNED_TO_SENDER"]), location: plainText(120).optional(), description: plainText(300).optional(), trackingNumber: plainText(80).optional() });
export const trackingEventBody = z.object({ title: plainText(120, 2), description: plainText(300).optional(), location: plainText(120).optional(), code: z.string().regex(/^[A-Z0-9_]{2,40}$/).optional(), metadata: z.record(z.string(), z.unknown()).optional() });
export const adminOrdersQuery = z.object({ search: z.string().trim().max(80).optional(), status: arrayParam(orderStatus).optional(), paymentStatus: z.enum(["UNPAID", "PENDING", "PAID", "FAILED", "PARTIALLY_REFUNDED", "REFUNDED"]).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), userId: id.optional(), ...paginationSchemaRef });
export const refundBody = z.object({ amount: z.number().int().min(1).optional(), reason: plainText(300, 3) });
export const returnDecisionBody = z.object({ approve: z.boolean(), note: plainText(300).optional(), pickupScheduledAt: z.coerce.date().optional() });
export const returnAdvanceBody = z.object({ status: z.enum(["PICKUP_SCHEDULED", "PICKED_UP", "RECEIVED"]), pickupScheduledAt: z.coerce.date().optional(), note: plainText(300).optional() });
export const moderationBody = z.object({ approve: z.boolean(), reason: plainText(300).optional() });
