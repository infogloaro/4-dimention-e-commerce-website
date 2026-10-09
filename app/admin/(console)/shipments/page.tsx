"use client";

import Link from "next/link";
import { usePagedQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { Badge, Card, DataTable, FilterBar, PageHeader, Pagination, SearchBox, Select, StatusBadge, Tabs, useUrlState } from "@/components/admin/ui";
import { fmtDate, titleCase } from "@/lib/admin/format";

interface Shipment { id: string; orderId: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; status: string; shippedAt: string | null; estimatedDelivery: string | null; deliveredAt: string | null; order: { orderNumber: string; status: string; customerName: string }; events: { title: string; location: string | null; occurredAt: string }[] }

export default function ShipmentsPage() {
  return (
    <RequirePermission anyOf={["order:read", "shipping:manage"]}>
      <Shipments />
    </RequirePermission>
  );
}

function Shipments() {
  const [f, set] = useUrlState({ view: "all", search: "", status: "", page: "1" });
  const q = usePagedQuery<Shipment>("shipments", "/admin/shipments", { search: f.search, status: f.status, exceptions: f.view === "exceptions" || undefined, missingTracking: f.view === "missing" || undefined, page: Number(f.page), pageSize: 20 });
  return (
    <>
      <PageHeader title="Shipments & tracking" description="Every shipment, tracked separately from its order. There is no live carrier integration: statuses and tracking numbers are entered by staff on the order page, and ETAs are shown only when staff supplied them." />
      <Card pad={false}>
        <div className="px-2 pt-1"><Tabs tabs={[{ id: "all", label: "All shipments" }, { id: "exceptions", label: "Delivery exceptions" }, { id: "missing", label: "Missing tracking" }]} value={f.view} onChange={(v) => set({ view: v })} /></div>
        <FilterBar>
          <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="Order #, tracking #, carrier" />
          <Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="w-48" disabled={f.view === "exceptions"}><option value="">Any status</option>{["PENDING", "LABEL_CREATED", "PICKED_UP", "IN_TRANSIT", "REACHED_HUB", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED_DELIVERY", "RETURNED_TO_SENDER"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
        </FilterBar>
        <DataTable rows={q.rows} loading={q.isLoading || q.isFetching} error={q.error} onRetry={() => q.refetch()} rowKey={(s) => s.id} pageSize={20}
          empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No shipments in this view.</p>}
          columns={[
            { key: "o", header: "Order", cell: (s) => <div><Link href={`/admin/orders/${s.orderId}`} className="font-medium text-indigo-700 hover:underline">{s.order.orderNumber}</Link><p className="text-xs text-slate-500">{s.order.customerName}</p></div> },
            { key: "c", header: "Carrier / tracking", cell: (s) => <div><p>{s.carrier ?? <span className="text-slate-400">—</span>}</p>{s.trackingNumber ? (s.trackingUrl ? <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-indigo-700 underline">{s.trackingNumber}</a> : <span className="font-mono text-xs">{s.trackingNumber}</span>) : <Badge tone="warning">No tracking #</Badge>}</div> },
            { key: "s", header: "Status", cell: (s) => <StatusBadge status={s.status} kind="shipment" /> },
            { key: "l", header: "Last event", cell: (s) => s.events[0] ? <div className="text-xs"><p>{s.events[0].title}</p><p className="text-slate-500">{fmtDate(s.events[0].occurredAt)}{s.events[0].location && ` · ${s.events[0].location}`}</p></div> : "—" },
            { key: "sh", header: "Shipped", cell: (s) => <span className="text-slate-600">{fmtDate(s.shippedAt, false)}</span> },
            { key: "e", header: "ETA (staff-entered)", cell: (s) => <span className="text-slate-600">{s.deliveredAt ? `Delivered ${fmtDate(s.deliveredAt, false)}` : fmtDate(s.estimatedDelivery, false)}</span> },
          ]} />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>
    </>
  );
}
