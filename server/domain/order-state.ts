import type { OrderStatus } from "../db/generated/client";

/** Order lifecycle state machine. Anything not listed is an illegal transition. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ["PLACED", "CANCELLED", "FAILED"],
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["OUT_FOR_DELIVERY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: ["RETURN_REQUESTED"],
  RETURN_REQUESTED: ["RETURNED", "DELIVERED"], // DELIVERED = return rejected / partially resolved
  RETURNED: [],
  CANCELLED: [],
  FAILED: [],
};

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["CANCELLED", "FAILED", "RETURNED"];

/** Statuses from which a *customer* may cancel (before the parcel is packed). */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ["PENDING_PAYMENT", "PLACED", "CONFIRMED", "PROCESSING"];

/** Statuses where stock has physically left / is committed to a shipment. */
export const POST_PACK_STATUSES: readonly OrderStatus[] = ["PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "RETURN_REQUESTED", "RETURNED"];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[from];
}

/** Customer-facing tracking copy for each status. */
export const TRACKING_COPY: Record<OrderStatus, { code: string; title: string; description: string }> = {
  PENDING_PAYMENT: { code: "AWAITING_PAYMENT", title: "Awaiting payment", description: "We're waiting for your payment to be confirmed." },
  PLACED: { code: "ORDER_PLACED", title: "Order placed", description: "Your order has been received." },
  CONFIRMED: { code: "ORDER_CONFIRMED", title: "Order confirmed", description: "The seller has confirmed your order." },
  PROCESSING: { code: "PROCESSING", title: "Processing", description: "Your items are being prepared." },
  PACKED: { code: "PACKED", title: "Packed", description: "Your package is packed and ready for pickup by the carrier." },
  SHIPPED: { code: "SHIPPED", title: "Shipped", description: "Your package has been handed to the carrier." },
  OUT_FOR_DELIVERY: { code: "OUT_FOR_DELIVERY", title: "Out for delivery", description: "Your package is out for delivery today." },
  DELIVERED: { code: "DELIVERED", title: "Delivered", description: "Your package was delivered." },
  CANCELLED: { code: "CANCELLED", title: "Cancelled", description: "This order was cancelled." },
  FAILED: { code: "PAYMENT_FAILED", title: "Payment failed", description: "The payment did not complete, so the order was not placed." },
  RETURN_REQUESTED: { code: "RETURN_REQUESTED", title: "Return requested", description: "A return has been requested for this order." },
  RETURNED: { code: "RETURNED", title: "Returned", description: "The returned items were received." },
};

/** The ordered stages the frontend renders in the progress timeline (cancel/return are side branches). */
export const HAPPY_PATH: readonly OrderStatus[] = ["PLACED", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];

export const RETURN_TRANSITIONS = {
  REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PICKUP_SCHEDULED", "RECEIVED", "CANCELLED"],
  PICKUP_SCHEDULED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["RECEIVED"],
  RECEIVED: ["REFUND_PENDING", "COMPLETED"],
  REFUND_PENDING: ["COMPLETED"],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
} as const;
export type ReturnStatusKey = keyof typeof RETURN_TRANSITIONS;
export const canTransitionReturn = (from: ReturnStatusKey, to: ReturnStatusKey) => (RETURN_TRANSITIONS[from] as readonly string[]).includes(to);
