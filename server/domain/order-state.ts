import type { OrderStatus } from "../db/generated/client";
import { ORDER_STATUS } from "../../lib/order-status";

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

/**
 * Customer-facing tracking copy for each status. Titles/descriptions come from lib/order-status.ts — the single mapping
 * shared with the storefront and the admin console — so the API timeline and every screen use identical wording.
 */
const copy = (code: string, status: OrderStatus) => ({ code, title: ORDER_STATUS[status]!.label, description: ORDER_STATUS[status]!.hint ?? "" });
export const TRACKING_COPY: Record<OrderStatus, { code: string; title: string; description: string }> = {
  PENDING_PAYMENT: copy("AWAITING_PAYMENT", "PENDING_PAYMENT"),
  PLACED: copy("ORDER_PLACED", "PLACED"),
  CONFIRMED: copy("ORDER_CONFIRMED", "CONFIRMED"),
  PROCESSING: copy("PROCESSING", "PROCESSING"),
  PACKED: copy("PACKED", "PACKED"),
  SHIPPED: copy("SHIPPED", "SHIPPED"),
  OUT_FOR_DELIVERY: copy("OUT_FOR_DELIVERY", "OUT_FOR_DELIVERY"),
  DELIVERED: copy("DELIVERED", "DELIVERED"),
  CANCELLED: copy("CANCELLED", "CANCELLED"),
  FAILED: copy("PAYMENT_FAILED", "FAILED"),
  RETURN_REQUESTED: copy("RETURN_REQUESTED", "RETURN_REQUESTED"),
  RETURNED: copy("RETURNED", "RETURNED"),
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
