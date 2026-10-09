"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { api } from "@/lib/admin/api";
import { fmtMoney, timeAgo } from "@/lib/admin/format";
import { statusLabel } from "@/lib/order-status";
import { useAuth } from "./providers";
import { Card, ErrorState, StatusBadge, cx } from "./ui";

interface Queues {
  generatedAt: string;
  counts: Record<string, number>;
  queues: { toConfirm: number; processing: number; packing: number; readyToShip: number; inTransit: number };
  attention: { pendingPayment: number; paymentFailed: number; manualReview: number; shipmentExceptions: number; returnRequests: number; returnsInFlight: number; refundIssues: number; failedFulfilmentActions: number };
  recentOrders: { id: string; orderNumber: string; status: string; paymentStatus: string; grandTotal: number; customerName: string; createdAt: string }[];
}

/** Live order desk: work queues, exceptions and the newest orders. Refreshes every 20 s while the tab is visible. */
export function OrderDesk() {
  const { can } = useAuth();
  const q = useQuery({
    queryKey: ["admin", "order-queues", "desk"],
    enabled: can("order:read"),
    refetchInterval: () => (typeof document !== "undefined" && document.visibilityState === "visible" ? 20_000 : false),
    queryFn: async () => (await api.get<Queues>("/admin/orders/queues")).data,
  });
  if (!can("order:read")) return null;
  const d = q.data;

  const queue = [
    { label: "New — to confirm", n: d?.queues.toConfirm, href: "/admin/orders?status=PLACED", hot: true },
    { label: "Processing", n: d?.queues.processing, href: "/admin/orders?status=PROCESSING" },
    { label: "Packing queue", n: d?.queues.packing, href: "/admin/orders?status=PROCESSING" },
    { label: "Ready to ship", n: d?.queues.readyToShip, href: "/admin/orders?status=PACKED", hot: true },
    { label: "In transit", n: d?.queues.inTransit, href: "/admin/orders?status=SHIPPED" },
  ];
  const attention = [
    { label: "Awaiting payment", n: d?.attention.pendingPayment, href: "/admin/orders?status=PENDING_PAYMENT" },
    { label: "Payment failed", n: d?.attention.paymentFailed, href: "/admin/orders?status=PENDING_PAYMENT&paymentStatus=FAILED" },
    { label: "Manual review", n: d?.attention.manualReview, href: "/admin/payments" },
    { label: "Shipment exceptions", n: d?.attention.shipmentExceptions, href: "/admin/shipments" },
    { label: "Return requests", n: d?.attention.returnRequests, href: "/admin/returns" },
    { label: "Refund issues", n: d?.attention.refundIssues, href: "/admin/refunds" },
    { label: "Failed notifications / webhooks", n: d?.attention.failedFulfilmentActions, href: "/admin/notifications" },
  ];

  return (
    <Card title="Order desk" actions={<span className="text-xs text-slate-500">{d ? `Live · updated ${timeAgo(d.generatedAt)}` : "Loading…"}</span>}>
      {q.error && !d ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Work queues</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {queue.map((t) => (
                  <Link key={t.label} href={t.href} className={cx("rounded-lg border p-3 transition hover:shadow-sm", t.hot && (t.n ?? 0) > 0 ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white")}>
                    <p className="text-2xl font-semibold tabular-nums">{t.n ?? "–"}</p><p className="text-xs text-slate-600">{t.label}</p>
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Needs attention</p>
              <div className="flex flex-wrap gap-2">
                {attention.map((t) => (
                  <Link key={t.label} href={t.href} className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs", (t.n ?? 0) > 0 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-500")}>
                    {t.label}<span className="font-semibold tabular-nums">{t.n ?? "–"}</span>
                  </Link>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">Customers cancel eligible orders themselves (so there is no cancellation-request queue); returns, refunds, payment exceptions and failed notification/webhook deliveries are listed above.</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Newest orders</p>
            {d && d.recentOrders.length === 0 ? <p className="flex items-center gap-2 text-sm text-slate-500"><Inbox className="size-4" aria-hidden /> No orders yet.</p> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {(d?.recentOrders ?? []).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0"><Link href={`/admin/orders/${o.id}`} className="font-medium text-indigo-700 hover:underline">{o.orderNumber}</Link><p className="truncate text-xs text-slate-500">{o.customerName} · {timeAgo(o.createdAt)} · {fmtMoney(o.grandTotal)}</p></div>
                    <span title={statusLabel(o.status, "order")}><StatusBadge status={o.status} kind="order" /></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
