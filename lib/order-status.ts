/**
 * THE mapping from backend state to the words and colours both the storefront and the admin console display.
 *
 * Browser-safe (no server imports). `server/domain/order-state.ts` takes its customer-facing titles from here, so the
 * tracking timeline the API returns, the customer's order page and the admin order screens can never drift apart.
 *
 * The backend keeps SIX separate state machines and so do we — never fold them into one "status":
 *   order · payment (order-level) · payment attempt · shipment · return · refund
 */
export type StatusKind = "order" | "payment" | "attempt" | "shipment" | "return" | "refund";
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

interface Entry { label: string; tone: StatusTone; hint?: string }

export const ORDER_STATUS: Record<string, Entry> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "warning", hint: "We're waiting for your payment to be confirmed." },
  PLACED: { label: "Order placed", tone: "info", hint: "Your order has been received." },
  CONFIRMED: { label: "Order confirmed", tone: "info", hint: "The seller has confirmed your order." },
  PROCESSING: { label: "Processing", tone: "accent", hint: "Your items are being prepared." },
  PACKED: { label: "Packed", tone: "accent", hint: "Your package is packed and ready for pickup by the carrier." },
  SHIPPED: { label: "Shipped", tone: "accent", hint: "Your package has been handed to the carrier." },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "accent", hint: "Your package is out for delivery today." },
  DELIVERED: { label: "Delivered", tone: "success", hint: "Your package was delivered." },
  CANCELLED: { label: "Cancelled", tone: "danger", hint: "This order was cancelled." },
  FAILED: { label: "Payment failed", tone: "danger", hint: "The payment did not complete, so the order was not placed." },
  RETURN_REQUESTED: { label: "Return requested", tone: "warning", hint: "A return has been requested for this order." },
  RETURNED: { label: "Returned", tone: "neutral", hint: "The returned items were received." },
};

export const PAYMENT_STATUS: Record<string, Entry> = {
  UNPAID: { label: "Unpaid", tone: "neutral", hint: "Nothing has been charged yet." },
  PENDING: { label: "Payment pending", tone: "warning", hint: "We're waiting for the payment provider to confirm." },
  PAID: { label: "Paid", tone: "success" },
  FAILED: { label: "Payment failed", tone: "danger" },
  PARTIALLY_REFUNDED: { label: "Partially refunded", tone: "warning" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

export const ATTEMPT_STATUS: Record<string, Entry> = {
  CREATED: { label: "Created", tone: "neutral" },
  REQUIRES_ACTION: { label: "Awaiting customer", tone: "warning" },
  AUTHORIZED: { label: "Authorised", tone: "info" },
  CAPTURED: { label: "Captured", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const SHIPMENT_STATUS: Record<string, Entry> = {
  PENDING: { label: "Awaiting dispatch", tone: "neutral" },
  LABEL_CREATED: { label: "Label created", tone: "info" },
  PICKED_UP: { label: "Picked up by carrier", tone: "info" },
  IN_TRANSIT: { label: "In transit", tone: "accent" },
  REACHED_HUB: { label: "Reached hub", tone: "accent" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "accent" },
  DELIVERED: { label: "Delivered", tone: "success" },
  FAILED_DELIVERY: { label: "Delivery attempt failed", tone: "danger" },
  RETURNED_TO_SENDER: { label: "Returned to sender", tone: "danger" },
};

export const RETURN_STATUS: Record<string, Entry> = {
  REQUESTED: { label: "Return requested", tone: "warning" },
  APPROVED: { label: "Return approved", tone: "info" },
  REJECTED: { label: "Return rejected", tone: "danger" },
  PICKUP_SCHEDULED: { label: "Pickup scheduled", tone: "info" },
  PICKED_UP: { label: "Picked up", tone: "accent" },
  RECEIVED: { label: "Received at warehouse", tone: "accent" },
  REFUND_PENDING: { label: "Refund pending", tone: "warning" },
  COMPLETED: { label: "Return completed", tone: "success" },
  CANCELLED: { label: "Return cancelled", tone: "neutral" },
};

export const REFUND_STATUS: Record<string, Entry> = {
  PENDING: { label: "Refund pending", tone: "warning" },
  PROCESSING: { label: "Refund processing", tone: "info" },
  SUCCEEDED: { label: "Refunded", tone: "success" },
  FAILED: { label: "Refund failed", tone: "danger" },
};

const TABLES: Record<StatusKind, Record<string, Entry>> = { order: ORDER_STATUS, payment: PAYMENT_STATUS, attempt: ATTEMPT_STATUS, shipment: SHIPMENT_STATUS, return: RETURN_STATUS, refund: REFUND_STATUS };
const SEARCH_ORDER: StatusKind[] = ["order", "payment", "shipment", "return", "refund", "attempt"];

const titleCase = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Look a state up in one machine (`kind`) — or, when the machine isn't known, in the first one that defines it. */
export function statusEntry(key: string, kind?: StatusKind): Entry | undefined {
  if (kind) return TABLES[kind][key];
  for (const k of SEARCH_ORDER) if (TABLES[k][key]) return TABLES[k][key];
  return undefined;
}
export const statusLabel = (key: string, kind?: StatusKind) => statusEntry(key, kind)?.label ?? titleCase(key);
export const statusTone = (key: string, kind?: StatusKind): StatusTone | undefined => statusEntry(key, kind)?.tone;

/** The linear stages a customer sees; cancellation, failure and returns are side branches. */
export const CUSTOMER_PROGRESS = ["PLACED", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

export interface OrderHeadline { tone: StatusTone; title: string; detail: string }

/**
 * One honest sentence describing where an order is, combining the order, payment and shipment machines.
 * Used by the confirmation page, order history and order detail so they always agree.
 */
export function orderHeadline(o: { status: string; paymentStatus: string; shipments?: { status: string }[] }): OrderHeadline {
  const { status, paymentStatus } = o;
  if (status === "FAILED" || (status === "PENDING_PAYMENT" && paymentStatus === "FAILED")) return { tone: "danger", title: "Payment failed", detail: "The payment did not complete, so this order has not been placed. You can try again." };
  if (status === "PENDING_PAYMENT") return { tone: "warning", title: "Payment pending", detail: "Your order is reserved while we wait for the payment provider to confirm. We'll update this page when it does." };
  if (status === "CANCELLED") return { tone: "danger", title: "Order cancelled", detail: paymentStatus === "REFUNDED" || paymentStatus === "PARTIALLY_REFUNDED" ? "This order was cancelled and the payment has been refunded." : paymentStatus === "PAID" ? "This order was cancelled. Your refund is being processed." : "This order was cancelled." };
  const failedDelivery = o.shipments?.some((s) => s.status === "FAILED_DELIVERY" || s.status === "RETURNED_TO_SENDER");
  if (failedDelivery) return { tone: "danger", title: "Delivery problem", detail: "The carrier reported a problem delivering your package. We're following up — check the tracking timeline for details." };
  const entry = ORDER_STATUS[status];
  return { tone: entry?.tone ?? "neutral", title: entry?.label ?? titleCase(status), detail: entry?.hint ?? "" };
}
