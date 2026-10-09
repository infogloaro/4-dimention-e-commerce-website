"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { exportCsv, usePagedQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { Btn, Card, DataTable, FilterBar, Input, PageHeader, Pagination, SearchBox, Select, StatusBadge, Tabs, useToast, useUrlState } from "@/components/admin/ui";
import { statusLabel } from "@/lib/order-status";
import { fmtDate, fmtMoney, titleCase } from "@/lib/admin/format";

export interface OrderRow {
  id: string; orderNumber: string; status: string; paymentStatus: string; grandTotal: number; currency: string;
  customerName: string; customerEmail: string; createdAt: string; placedAt: string | null; userId: string; itemCount: number; paymentProvider: string | null;
}

// Status tabs map to the real order state machine; they replace one sidebar entry per status.
const TABS = [
  { id: "", label: "All" },
  { id: "PENDING_PAYMENT", label: statusLabel("PENDING_PAYMENT", "order") },
  { id: "PLACED", label: statusLabel("PLACED", "order") },
  { id: "CONFIRMED", label: statusLabel("CONFIRMED", "order") },
  { id: "PROCESSING", label: statusLabel("PROCESSING", "order") },
  { id: "PACKED", label: statusLabel("PACKED", "order") },
  { id: "SHIPPED", label: statusLabel("SHIPPED", "order") },
  { id: "OUT_FOR_DELIVERY", label: statusLabel("OUT_FOR_DELIVERY", "order") },
  { id: "DELIVERED", label: statusLabel("DELIVERED", "order") },
  { id: "CANCELLED", label: statusLabel("CANCELLED", "order") },
  { id: "FAILED", label: statusLabel("FAILED", "order") },
  { id: "RETURN_REQUESTED", label: statusLabel("RETURN_REQUESTED", "order") },
  { id: "RETURNED", label: statusLabel("RETURNED", "order") },
];

export default function OrdersPage() {
  return (
    <RequirePermission anyOf={["order:read"]}>
      <Orders />
    </RequirePermission>
  );
}

function Orders() {
  const router = useRouter();
  const toast = useToast();
  const [f, set] = useUrlState({ search: "", status: "", paymentStatus: "", from: "", to: "", page: "1" });
  const [exporting, setExporting] = useState(false);
  const params = { search: f.search, status: f.status || undefined, paymentStatus: f.paymentStatus, from: f.from ? `${f.from}T00:00:00+05:30` : undefined, to: f.to ? `${f.to}T23:59:59+05:30` : undefined, page: Number(f.page), pageSize: 20 };
  const q = usePagedQuery<OrderRow>("orders", "/admin/orders", params, true, 20_000); // live: new orders appear without a reload

  async function doExport() {
    setExporting(true);
    try {
      const n = await exportCsv<OrderRow>("/admin/orders", { ...params, page: undefined, pageSize: undefined }, [
        { key: "orderNumber", label: "Order" }, { key: "createdAt", label: "Created (UTC)" }, { key: "status", label: "Status" }, { key: "paymentStatus", label: "Payment status" },
        { key: "paymentProvider", label: "Payment method" }, { key: "itemCount", label: "Items" }, { key: "grandTotal", label: "Total (paise)" }, { key: "currency", label: "Currency" },
      ], `orders-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`Exported ${n} orders (customer contact details are excluded)`);
    } catch (e) { toast.fail(e); } finally { setExporting(false); }
  }

  return (
    <>
      <PageHeader title="Orders" description="Every order from checkout through delivery. Status filters follow the order state machine; payment, shipment and refund states are shown separately in the order workspace." actions={<Btn onClick={doExport} loading={exporting}><Download className="size-4" /> Export CSV</Btn>} />
      <Card pad={false}>
        <div className="px-2 pt-1"><Tabs tabs={TABS} value={f.status} onChange={(v) => set({ status: v })} /></div>
        <FilterBar>
          <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="Order #, email, name, phone" />
          <Select aria-label="Payment status" value={f.paymentStatus} onChange={(e) => set({ paymentStatus: e.target.value })} className="w-44">
            <option value="">Any payment status</option>
            {["UNPAID", "PENDING", "PAID", "FAILED", "PARTIALLY_REFUNDED", "REFUNDED"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">From <Input type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} className="w-38" /></label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">To <Input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} className="w-38" /></label>
          {(f.search || f.paymentStatus || f.from || f.to) && <Btn size="sm" variant="ghost" onClick={() => set({ search: "", paymentStatus: "", from: "", to: "" })}>Clear filters</Btn>}
        </FilterBar>
        <DataTable
          rows={q.rows}
          loading={q.isLoading || q.isFetching}
          error={q.error}
          onRetry={() => q.refetch()}
          rowKey={(o) => o.id}
          pageSize={20}
          onRowClick={(o) => router.push(`/admin/orders/${o.id}`)}
          columns={[
            { key: "n", header: "Order", cell: (o) => <Link href={`/admin/orders/${o.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-indigo-700 hover:underline">{o.orderNumber}</Link> },
            { key: "d", header: "Date", cell: (o) => <span className="text-slate-600">{fmtDate(o.placedAt ?? o.createdAt)}</span> },
            { key: "c", header: "Customer", cell: (o) => <div><p className="font-medium">{o.customerName}</p><p className="text-xs text-slate-500">{o.customerEmail}</p></div> },
            { key: "i", header: "Items", align: "right", cell: (o) => o.itemCount },
            { key: "t", header: "Total", align: "right", cell: (o) => fmtMoney(o.grandTotal, o.currency) },
            { key: "ps", header: "Payment", cell: (o) => <div className="flex flex-col items-start gap-0.5"><StatusBadge status={o.paymentStatus} kind="payment" /><span className="text-[11px] text-slate-500">{o.paymentProvider ?? "—"}</span></div> },
            { key: "s", header: "Order status", cell: (o) => <StatusBadge status={o.status} kind="order" /> },
          ]}
          empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No orders match these filters.</p>}
        />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>
    </>
  );
}
