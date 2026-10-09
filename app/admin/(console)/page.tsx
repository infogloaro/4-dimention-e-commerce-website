"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { AreaChart, BarList } from "@/components/admin/charts";
import { useDataQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { OrderDesk } from "@/components/admin/order-desk";
import { Card, DataTable, ErrorState, PageHeader, StatCard, StatusBadge } from "@/components/admin/ui";
import { fmtCompactMoney, fmtDate, fmtMoney, fmtNumber, titleCase } from "@/lib/admin/format";

interface Dashboard {
  generatedAt: string;
  kpis: { revenueToday: number; ordersToday: number; revenue7d: number; orders7d: number; revenue30d: number; orders30d: number; averageOrderValue30d: number; revenueChangePct30d: number | null; ordersChangePct30d: number | null; refunds30d: number };
  customers: { total: number; new30d: number; repeatRatePct: number };
  products: { active: number; draft: number; lowStock: number };
  orders: { pending: number; awaitingPayment: number; toShip: number; inTransit: number; byStatus: Record<string, number> };
  alerts: { openReturns: number; pendingRefunds: number; lowStockCount: number };
  salesTrend: { date: string; revenue: number; orders: number }[];
  topProducts: { productId: string; name: string; unitsSold: number; revenue: number }[];
  lowStock: { variantId: string; sku: string; productName: string; quantity: number; reserved: number; threshold: number }[];
  recentOrders: { id: string; orderNumber: string; status: string; paymentStatus: string; grandTotal: number; customerName: string; createdAt: string }[];
  funnel: { cartsCreated: number; checkoutsStarted: number; ordersPlaced: number; checkoutCompletionPct: number; cartToOrderPct: number };
}

const pct = (v: number | null) => (v === null ? "no prior period" : `${v > 0 ? "+" : ""}${v.toFixed(1)}% vs prev. 30d`);

export default function DashboardPage() {
  return (
    <RequirePermission anyOf={["dashboard:read"]}>
      <Dashboard />
    </RequirePermission>
  );
}

function Dashboard() {
  const q = useDataQuery<Dashboard>(["dashboard"], "/admin/dashboard");
  const d = q.data;
  return (
    <>
      <PageHeader title="Dashboard" description={d ? `Live from the database · generated ${fmtDate(d.generatedAt)} IST · KPIs are cached up to 30 s, rollups use UTC days.` : "Operational overview"} />
      {q.error ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : (
        <div className="space-y-5">
          <OrderDesk />
          {d && (d.alerts.openReturns + d.alerts.pendingRefunds + d.alerts.lowStockCount > 0 || d.orders.awaitingPayment > 0) && (
            <div role="status" className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
              <AlertTriangle className="size-4" aria-hidden />
              {d.orders.toShip > 0 && <Link className="underline" href="/admin/orders?status=PROCESSING">{d.orders.toShip} to ship</Link>}
              {d.orders.awaitingPayment > 0 && <Link className="underline" href="/admin/orders?status=PENDING_PAYMENT">{d.orders.awaitingPayment} awaiting payment</Link>}
              {d.alerts.openReturns > 0 && <Link className="underline" href="/admin/returns">{d.alerts.openReturns} open returns</Link>}
              {d.alerts.pendingRefunds > 0 && <Link className="underline" href="/admin/refunds">{d.alerts.pendingRefunds} refunds pending</Link>}
              {d.alerts.lowStockCount > 0 && <Link className="underline" href="/admin/inventory?lowStockOnly=true">{d.alerts.lowStockCount} low-stock variants</Link>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard loading={!d} label="Revenue · 30 days" value={d && fmtCompactMoney(d.kpis.revenue30d)} hint={d && pct(d.kpis.revenueChangePct30d)} />
            <StatCard loading={!d} label="Orders · 30 days" value={d && fmtNumber(d.kpis.orders30d)} hint={d && `${d.kpis.ordersToday} today · ${pct(d.kpis.ordersChangePct30d)}`} />
            <StatCard loading={!d} label="Average order value" value={d && fmtMoney(d.kpis.averageOrderValue30d)} hint="Last 30 days" />
            <StatCard loading={!d} label="Refunds · 30 days" value={d && fmtMoney(d.kpis.refunds30d)} tone={d && d.kpis.refunds30d > 0 ? "warning" : "neutral"} />
            <StatCard loading={!d} label="Revenue · today" value={d && fmtMoney(d.kpis.revenueToday)} hint={d && `7d: ${fmtCompactMoney(d.kpis.revenue7d)} (${d.kpis.orders7d} orders)`} />
            <StatCard loading={!d} label="Awaiting payment" value={d && d.orders.awaitingPayment} href="/admin/orders?status=PENDING_PAYMENT" tone={d && d.orders.awaitingPayment > 0 ? "warning" : "neutral"} />
            <StatCard loading={!d} label="Low-stock variants" value={d && d.alerts.lowStockCount} href="/admin/inventory?lowStockOnly=true" tone={d && d.alerts.lowStockCount > 0 ? "danger" : "neutral"} hint={d && `${d.products.active} active products`} />
            <StatCard loading={!d} label="Customers" value={d && fmtNumber(d.customers.total)} hint={d && `${d.customers.new30d} new · ${d.customers.repeatRatePct}% repeat`} href="/admin/customers" />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card title="Sales · last 30 days (UTC days)" className="xl:col-span-2">
              {d ? <AreaChart data={d.salesTrend.map((s) => ({ label: s.date, value: s.revenue, secondary: s.orders }))} format={(n) => fmtMoney(n)} primaryLabel="Revenue" secondaryLabel="Orders" /> : <div className="h-52 animate-pulse rounded bg-slate-100" />}
            </Card>
            <Card title="Orders by status">
              {d ? <BarList items={Object.entries(d.orders.byStatus).map(([k, v]) => ({ label: titleCase(k), value: v }))} format={(n) => String(n)} /> : <div className="h-40 animate-pulse rounded bg-slate-100" />}
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Recent orders" actions={<Link href="/admin/orders" className="text-xs text-indigo-600 hover:underline">View all</Link>} pad={false}>
              <DataTable
                rows={d?.recentOrders}
                loading={!d}
                rowKey={(o) => o.id}
                pageSize={5}
                columns={[
                  { key: "n", header: "Order", cell: (o) => <Link className="font-medium text-indigo-700 hover:underline" href={`/admin/orders/${o.id}`}>{o.orderNumber}</Link> },
                  { key: "c", header: "Customer", cell: (o) => o.customerName },
                  { key: "s", header: "Status", cell: (o) => <StatusBadge status={o.status} kind="order" /> },
                  { key: "t", header: "Total", align: "right", cell: (o) => fmtMoney(o.grandTotal) },
                ]}
              />
            </Card>
            <Card title="Inventory alerts" actions={<Link href="/admin/inventory?lowStockOnly=true" className="text-xs text-indigo-600 hover:underline">Manage stock</Link>} pad={false}>
              <DataTable
                rows={d?.lowStock}
                loading={!d}
                rowKey={(l) => l.variantId}
                pageSize={5}
                empty={<p className="px-4 py-8 text-center text-sm text-slate-500">No variants are at or below their low-stock threshold.</p>}
                columns={[
                  { key: "p", header: "Product", cell: (l) => <div><p className="font-medium">{l.productName}</p><p className="font-mono text-xs text-slate-500">{l.sku}</p></div> },
                  { key: "q", header: "On hand", align: "right", cell: (l) => <span className={l.quantity - l.reserved <= 0 ? "font-semibold text-rose-600" : ""}>{l.quantity}</span> },
                  { key: "r", header: "Reserved", align: "right", cell: (l) => l.reserved },
                  { key: "t", header: "Threshold", align: "right", cell: (l) => l.threshold },
                ]}
              />
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Top products · 30 days">
              {d ? <BarList items={d.topProducts.map((p) => ({ label: p.name, value: p.revenue, hint: `${p.unitsSold} sold` }))} format={fmtCompactMoney} /> : <div className="h-40 animate-pulse rounded bg-slate-100" />}
            </Card>
            <Card title="Checkout funnel · 30 days">
              {d ? (
                <BarList
                  items={[
                    { label: "Carts created", value: d.funnel.cartsCreated },
                    { label: "Checkouts started", value: d.funnel.checkoutsStarted },
                    { label: "Orders placed", value: d.funnel.ordersPlaced, hint: `${d.funnel.checkoutCompletionPct}% of checkouts` },
                  ]}
                  format={(n) => String(n)}
                />
              ) : <div className="h-40 animate-pulse rounded bg-slate-100" />}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
