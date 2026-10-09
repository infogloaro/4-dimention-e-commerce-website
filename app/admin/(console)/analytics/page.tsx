"use client";

import { Download } from "lucide-react";
import { useMemo } from "react";
import { AreaChart, BarList } from "@/components/admin/charts";
import { useDataQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { Btn, Card, DataTable, ErrorState, Input, PageHeader, Select, StatCard, useToast, useUrlState } from "@/components/admin/ui";
import { downloadFile, fmtCompactMoney, fmtMoney, fmtNumber, isoDay, toCsv } from "@/lib/admin/format";

interface Sales {
  range: { from: string; to: string; granularity: string; days: number };
  totals: { orders: number; revenue: number; refunds: number; itemsSold: number; discounts: number; newCustomers: number; netRevenue: number; averageOrderValue: number };
  comparison: { revenueChangePct: number | null; ordersChangePct: number | null };
  series: { period: string; orders: number; itemsSold: number; revenue: number; discounts: number; refunds: number; shipping: number; tax: number; newCustomers: number; cancelled: number; netRevenue: number; averageOrderValue: number }[];
}
interface Products { topProducts: { productId: string; name: string; unitsSold: number; revenue: number }[]; categories: { category: string; unitsSold: number; revenue: number; orders: number }[] }
interface Customers { customers: { totalCustomers: number; newCustomers: number; repeatCustomers: number; customersWithOrders: number; repeatRatePct: number; topCustomers: { id: string; name: string; email: string; ordersCount: number; lifetimeValue: number }[] }; funnel: { cartsCreated: number; checkoutsStarted: number; ordersPlaced: number; checkoutCompletionPct: number; cartToOrderPct: number } }

const PRESETS: Record<string, { label: string; from: () => string; to: () => string }> = {
  today: { label: "Today", from: () => isoDay(0), to: () => isoDay(0) },
  yesterday: { label: "Yesterday", from: () => isoDay(-1), to: () => isoDay(-1) },
  "7d": { label: "Last 7 days", from: () => isoDay(-6), to: () => isoDay(0) },
  "30d": { label: "Last 30 days", from: () => isoDay(-29), to: () => isoDay(0) },
  month: { label: "This month", from: () => isoDay(0).slice(0, 8) + "01", to: () => isoDay(0) },
  prev: {
    label: "Previous month",
    from: () => { const d = new Date(isoDay(0).slice(0, 8) + "01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); },
    to: () => { const d = new Date(isoDay(0).slice(0, 8) + "01T00:00:00Z"); d.setUTCDate(0); return d.toISOString().slice(0, 10); },
  },
  custom: { label: "Custom range", from: () => isoDay(-29), to: () => isoDay(0) },
};

export default function AnalyticsPage() {
  return (
    <RequirePermission anyOf={["analytics:read"]}>
      <Analytics />
    </RequirePermission>
  );
}

function Analytics() {
  const toast = useToast();
  const [f, set] = useUrlState({ preset: "30d", from: "", to: "", granularity: "day" });
  const range = useMemo(() => {
    const p = PRESETS[f.preset] ?? PRESETS["30d"];
    return { from: f.preset === "custom" && f.from ? f.from : p.from(), to: f.preset === "custom" && f.to ? f.to : p.to() };
  }, [f.preset, f.from, f.to]);
  const params = { ...range, granularity: f.granularity, limit: 10 };
  const sales = useDataQuery<Sales>(["analytics", "sales"], "/admin/analytics/sales", params);
  const prods = useDataQuery<Products>(["analytics", "products"], "/admin/analytics/products", params);
  const cust = useDataQuery<Customers>(["analytics", "customers"], "/admin/analytics/customers", params);
  const s = sales.data;

  const exportSales = () => {
    if (!s) return;
    downloadFile(`sales-${range.from}_${range.to}.csv`, toCsv(s.series as unknown as Record<string, unknown>[], [
      { key: "period", label: "Period (UTC)" }, { key: "orders", label: "Orders" }, { key: "itemsSold", label: "Items sold" },
      { key: "revenue", label: "Revenue (paise)" }, { key: "discounts", label: "Discounts (paise)" }, { key: "refunds", label: "Refunds (paise)" },
      { key: "shipping", label: "Shipping (paise)" }, { key: "tax", label: "Tax (paise)" }, { key: "cancelled", label: "Cancelled" }, { key: "newCustomers", label: "New customers" },
    ]));
    toast.success("Sales report exported");
  };

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Day boundaries are UTC (rollup policy). Net sales = revenue − refunds. Figures come from the DailySalesStat rollup; today refreshes at most every 60 s."
        actions={<Btn onClick={exportSales} disabled={!s}><Download className="size-4" /> Export CSV</Btn>}
      />
      <Card className="mb-5" pad={false}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Select aria-label="Date range" value={f.preset} onChange={(e) => set({ preset: e.target.value })} className="w-44">
            {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          {f.preset === "custom" && (
            <>
              <Input type="date" aria-label="From" value={range.from} max={range.to} onChange={(e) => set({ from: e.target.value })} className="w-40" />
              <Input type="date" aria-label="To" value={range.to} min={range.from} onChange={(e) => set({ to: e.target.value })} className="w-40" />
            </>
          )}
          <Select aria-label="Granularity" value={f.granularity} onChange={(e) => set({ granularity: e.target.value })} className="w-32">
            <option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option>
          </Select>
          <span className="text-xs text-slate-500">{range.from} → {range.to}</span>
        </div>
      </Card>

      {sales.error ? <Card><ErrorState error={sales.error} onRetry={() => sales.refetch()} /></Card> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard loading={!s} label="Gross sales" value={s && fmtCompactMoney(s.totals.revenue)} hint={s?.comparison.revenueChangePct != null ? `${s.comparison.revenueChangePct.toFixed(1)}% vs previous period` : "No previous-period data"} />
            <StatCard loading={!s} label="Net sales" value={s && fmtCompactMoney(s.totals.netRevenue)} hint={s && `${fmtMoney(s.totals.refunds)} refunded`} />
            <StatCard loading={!s} label="Orders" value={s && fmtNumber(s.totals.orders)} hint={s && `${fmtNumber(s.totals.itemsSold)} items sold`} />
            <StatCard loading={!s} label="Average order value" value={s && fmtMoney(s.totals.averageOrderValue)} hint={s && `${fmtMoney(s.totals.discounts)} discounts`} />
          </div>
          <Card title="Revenue over time">
            {s ? <AreaChart data={s.series.map((p) => ({ label: p.period, value: p.revenue, secondary: p.orders }))} format={(n) => fmtMoney(n)} primaryLabel="Revenue" secondaryLabel="Orders" /> : <div className="h-52 animate-pulse rounded bg-slate-100" />}
          </Card>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Revenue by category">
              {prods.error ? <ErrorState error={prods.error} onRetry={() => prods.refetch()} /> : prods.data ? <BarList items={prods.data.categories.map((c) => ({ label: c.category, value: c.revenue, hint: `${c.unitsSold} units` }))} format={fmtCompactMoney} /> : <div className="h-40 animate-pulse rounded bg-slate-100" />}
            </Card>
            <Card title="Bestselling products">
              {prods.error ? <ErrorState error={prods.error} /> : prods.data ? <BarList items={prods.data.topProducts.map((p) => ({ label: p.name, value: p.revenue, hint: `${p.unitsSold} sold` }))} format={fmtCompactMoney} /> : <div className="h-40 animate-pulse rounded bg-slate-100" />}
            </Card>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Customer acquisition & repeat purchase">
              {cust.error ? <ErrorState error={cust.error} onRetry={() => cust.refetch()} /> : cust.data ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div><p className="text-xl font-semibold">{cust.data.customers.newCustomers}</p><p className="text-xs text-slate-500">New customers</p></div>
                    <div><p className="text-xl font-semibold">{cust.data.customers.repeatCustomers}</p><p className="text-xs text-slate-500">Repeat customers</p></div>
                    <div><p className="text-xl font-semibold">{cust.data.customers.repeatRatePct}%</p><p className="text-xs text-slate-500">Repeat rate</p></div>
                  </div>
                  <BarList items={[{ label: "Carts created", value: cust.data.funnel.cartsCreated }, { label: "Checkouts started", value: cust.data.funnel.checkoutsStarted }, { label: "Orders placed", value: cust.data.funnel.ordersPlaced }]} format={(n) => String(n)} />
                </div>
              ) : <div className="h-40 animate-pulse rounded bg-slate-100" />}
            </Card>
            <Card title="Top customers" pad={false}>
              <DataTable
                rows={cust.data?.customers.topCustomers}
                loading={cust.isLoading}
                error={cust.error}
                rowKey={(c) => c.id}
                columns={[
                  { key: "n", header: "Customer", cell: (c) => <div><p className="font-medium">{c.name}</p><p className="text-xs text-slate-500">{c.email}</p></div> },
                  { key: "o", header: "Orders", align: "right", cell: (c) => c.ordersCount },
                  { key: "l", header: "Lifetime value", align: "right", cell: (c) => fmtMoney(c.lifetimeValue) },
                ]}
              />
            </Card>
          </div>
          <p className="text-xs text-slate-500">Not yet measurable from current data: revenue by brand, payment-method mix, refund/cancellation trend by cause, stock ageing, coupon performance (see Coupons for per-coupon analytics) and fulfilment SLA timings. These need new aggregation endpoints and are tracked in the status report.</p>
        </div>
      )}
    </>
  );
}
