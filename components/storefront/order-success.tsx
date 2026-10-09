"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Banner, OrderItems, OrderTotals, StatusPill } from "./order-parts";
import { useShop } from "./shop-provider";
import { ApiError, errorMessage } from "@/lib/shop/api";
import { useApi } from "@/lib/shop/hooks";
import { formatDate, formatDateRange } from "@/lib/shop/format";
import { orderHeadline } from "@/lib/order-status";
import type { Order } from "@/lib/shop/types";

/**
 * Confirmation page. It trusts NOTHING in the URL except the order number: the order, its status, totals and payment state
 * are loaded from the protected API (which only returns orders owned by the signed-in customer). Reloading it is a plain
 * read — it can never create an order. The heading and the success tick depend on the order's real state.
 */
export function OrderSuccess() {
  const router = useRouter();
  const number = useSearchParams().get("order");
  const { user, authReady } = useShop();
  useEffect(() => { if (authReady && !user) router.replace(`/login?next=${encodeURIComponent(`/checkout/success?order=${number ?? ""}`)}`); }, [authReady, user, router, number]);

  const pendingPoll = 8000;
  const { data: order, error, loading, reload } = useApi<Order>(user && number ? `/orders/${encodeURIComponent(number)}` : null, undefined, { pollMs: pendingPoll });

  if (!number) return <Shell><Banner tone="danger" title="No order to show">This page needs an order number. <Link className="underline" href="/account/orders">View your orders</Link>.</Banner></Shell>;
  if (!authReady || (loading && !order)) return <Shell><div className="h-56 animate-pulse rounded-xl bg-[#ebeae2]" aria-label="Loading your order" /></Shell>;
  if (error && !order) {
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 403);
    return <Shell><Banner tone="danger" title={notFound ? "We couldn't find that order" : "We couldn't load your order"}>{notFound ? "No order with that number exists on your account, so nothing has been confirmed here." : errorMessage(error)}<div className="mt-3 flex gap-4">{!notFound && <button className="underline" onClick={reload}>Try again</button>}<Link className="underline" href="/account/orders">View your orders</Link><Link className="underline" href="/cart">Back to bag</Link></div></Banner></Shell>;
  }
  if (!order) return null;

  const h = orderHeadline({ status: order.status, paymentStatus: order.paymentStatus, shipments: order.tracking.shipments });
  const confirmed = !["PENDING_PAYMENT", "FAILED", "CANCELLED"].includes(order.status);
  const pending = order.status === "PENDING_PAYMENT" && order.paymentStatus !== "FAILED";
  const failed = h.title === "Payment failed";
  const cod = order.payments.some((p) => p.provider === "COD");
  const eta = formatDateRange(order.shipping?.estimatedDelivery.min, order.shipping?.estimatedDelivery.max);
  const payment = order.payments[0];
  const a = order.shippingAddress;

  return (
    <Shell>
      {confirmed ? (
        <Banner tone="success" title="Thank you — your order is confirmed">Order <strong>{order.orderNumber}</strong> was placed {formatDate(order.placedAt ?? order.createdAt, true)}.{cod ? " You'll pay in cash on delivery." : ""} We&apos;ll update the status as it moves through packing and delivery.</Banner>
      ) : pending ? (
        <Banner tone="warning" title="Payment pending">Your order <strong>{order.orderNumber}</strong> has been created but isn&apos;t confirmed until the payment is verified. This page refreshes automatically. {order.actions.canPay ? "Items are reserved for a limited time." : ""}</Banner>
      ) : failed ? (
        <Banner tone="danger" title="Payment failed — order not placed">{h.detail} No order number should be treated as confirmed. <Link className="underline" href="/checkout">Return to checkout</Link>.</Banner>
      ) : (
        <Banner tone="danger" title={h.title}>{h.detail}</Banner>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="items-h">
          <h2 id="items-h" className="mb-4 text-lg font-semibold">Items in this order</h2>
          <OrderItems items={order.items} />
        </section>
        <aside className="space-y-5">
          <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-3 text-lg font-semibold">Order details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-[#717168]">Order number</dt><dd className="font-mono font-medium">{order.orderNumber}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[#717168]">Placed</dt><dd>{formatDate(order.placedAt ?? order.createdAt, true)}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-[#717168]">Order status</dt><dd><StatusPill status={order.status} kind="order" /></dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-[#717168]">Payment</dt><dd><StatusPill status={order.paymentStatus} kind="payment" /></dd></div>
              {payment && <div className="flex justify-between gap-3"><dt className="text-[#717168]">Method</dt><dd>{payment.provider === "COD" ? "Cash on delivery" : payment.method.replace(/_/g, " ")}</dd></div>}
              {eta && confirmed && <div className="flex justify-between gap-3"><dt className="text-[#717168]">Estimated delivery</dt><dd>{eta}</dd></div>}
            </dl>
            <div className="mt-4 border-t border-black/10 pt-4"><OrderTotals order={order} /></div>
          </div>
          {a && (
            <div className="rounded-xl border border-black/10 bg-white p-5 text-sm shadow-sm sm:p-6">
              <h2 className="mb-2 text-lg font-semibold">Delivering to</h2>
              <p className="font-medium">{a.fullName}</p>
              <p className="leading-6 text-[#62635b]">{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.state} {a.postalCode}<br />{a.phone}</p>
            </div>
          )}
        </aside>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={`/account/orders/${order.orderNumber}`} className="rounded-full bg-[#22231f] px-6 py-3 text-sm font-semibold text-white hover:bg-[#44463b]">View order details</Link>
        {confirmed && <Link href={`/account/orders/${order.orderNumber}#tracking`} className="rounded-full border border-[#22231f] px-6 py-3 text-sm font-semibold hover:bg-[#22231f] hover:text-white">Track this order</Link>}
        <Link href="/products" className="rounded-full border border-black/20 px-6 py-3 text-sm font-semibold hover:border-black/50">Continue shopping</Link>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">{children}</div>;
}
