"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { ProductImage } from "./product-image";
import { StatusPill } from "./order-parts";
import { useShop } from "./shop-provider";
import { errorMessage } from "@/lib/shop/api";
import { useApi } from "@/lib/shop/hooks";
import { formatDate, formatDateRange, money } from "@/lib/shop/format";
import { statusLabel } from "@/lib/order-status";
import type { OrderSummary } from "@/lib/shop/types";

export function useRequireCustomer(nextPath: string) {
  const router = useRouter();
  const shop = useShop();
  useEffect(() => { if (shop.authReady && !shop.user) router.replace(`/login?next=${encodeURIComponent(nextPath)}`); }, [shop.authReady, shop.user, router, nextPath]);
  return shop;
}

const TRACKABLE = ["PLACED", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "RETURN_REQUESTED"];

export function AccountOrders() {
  const { user, authReady } = useRequireCustomer("/account/orders");
  const [page, setPage] = useState(1);
  const { data, meta, error, loading, reload } = useApi<OrderSummary[]>(user ? "/orders" : null, { page, pageSize: 10 }, { pollMs: 60_000 });

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="text-4xl font-medium tracking-[-0.06em]">Your orders<span className="text-[#87964f]">.</span></h1>
      <p className="mt-2 text-sm text-[#717168]">Track, cancel or return what you&apos;ve bought.</p>
      <div className="mt-8 space-y-4" aria-busy={loading}>
        {(!authReady || loading) && !data && [0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-[#ebeae2]" />)}
        {error && !data && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">{errorMessage(error)} <button className="ml-2 underline" onClick={reload}>Retry</button></div>}
        {data && data.length === 0 && (
          <div className="rounded-xl border border-black/10 bg-white p-12 text-center">
            <Package size={36} strokeWidth={1.2} className="mx-auto text-[#77786f]" aria-hidden />
            <p className="mt-4 text-xl font-medium">No orders yet</p>
            <p className="mt-1 text-sm text-[#717168]">When you place an order it will appear here with live tracking.</p>
            <Link href="/products" className="mt-6 inline-block rounded-full bg-[#22231f] px-6 py-3 text-sm font-semibold text-white">Start shopping</Link>
          </div>
        )}
        {data?.map((o) => {
          const shipment = o.shipments[0];
          const eta = formatDateRange(o.estimatedDelivery.min, o.estimatedDelivery.max);
          return (
            <article key={o.id} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-mono text-sm font-semibold">{o.orderNumber}</p><p className="text-xs text-[#77786f]">Placed {formatDate(o.placedAt)} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}</p></div>
                <div className="flex flex-wrap items-center gap-2"><StatusPill status={o.status} kind="order" /><StatusPill status={o.paymentStatus} kind="payment" />{shipment && <StatusPill status={shipment.status} kind="shipment" />}</div>
              </header>
              <ul className="mt-4 flex items-center gap-3 overflow-x-auto" aria-label="Items in this order">
                {o.preview.map((i) => <li key={i.id} className="flex shrink-0 items-center gap-3"><div className="h-16 w-16 overflow-hidden rounded-md bg-[#f0efe9]"><ProductImage src={i.imageUrl} alt={i.name} boxClassName="h-full w-full" className="p-1" width={64} height={64} /></div><p className="hidden max-w-[11rem] text-sm leading-5 sm:block"><span className="line-clamp-2">{i.name}</span><span className="text-xs text-[#77786f]">Qty {i.quantity}</span></p></li>)}
                {o.itemCount > o.preview.length && <li className="shrink-0 text-xs text-[#77786f]">+{o.itemCount - o.preview.length} more</li>}
              </ul>
              <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
                <div className="text-sm"><span className="font-semibold">{money(o.grandTotal, o.currency)}</span>{eta && ["PLACED", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY"].includes(o.status) && <span className="ml-3 text-xs text-[#77786f]">Estimated delivery {eta}</span>}{shipment?.trackingNumber && <span className="ml-3 text-xs text-[#77786f]">{shipment.carrier ?? "Tracking"} {shipment.trackingNumber}</span>}</div>
                <div className="flex gap-2">
                  {TRACKABLE.includes(o.status) && <Link href={`/account/orders/${o.orderNumber}#tracking`} className="rounded-full bg-[#22231f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#44463b]">Track order</Link>}
                  <Link href={`/account/orders/${o.orderNumber}`} className="rounded-full border border-black/20 px-4 py-2 text-xs font-semibold hover:border-black/50">{["PLACED", "CONFIRMED", "PROCESSING"].includes(o.status) ? "View / cancel" : o.status === "DELIVERED" ? "View / return" : `View details`}</Link>
                </div>
              </footer>
              <span className="sr-only">Current status: {statusLabel(o.status, "order")}</span>
            </article>
          );
        })}
      </div>
      {meta && meta.totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-3">
          <button disabled={!meta.hasPreviousPage} onClick={() => setPage(page - 1)} className="rounded-full border border-black/15 px-4 py-2 text-sm disabled:opacity-40">Previous</button>
          <span className="text-sm text-[#717168]">Page {meta.page} of {meta.totalPages}</span>
          <button disabled={!meta.hasNextPage} onClick={() => setPage(page + 1)} className="rounded-full border border-black/15 px-4 py-2 text-sm disabled:opacity-40">Next</button>
        </nav>
      )}
    </div>
  );
}
