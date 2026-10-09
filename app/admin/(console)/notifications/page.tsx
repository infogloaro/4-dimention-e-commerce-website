"use client";

import { usePagedQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { Badge, Card, DataTable, FilterBar, PageHeader, Pagination, Select, StatusBadge, useUrlState } from "@/components/admin/ui";
import { fmtDate } from "@/lib/admin/format";

interface Delivery { id: string; channel: string; recipient: string; template: string; status: string; provider: string | null; providerRef: string | null; attempts: number; error: string | null; createdAt: string; sentAt: string | null }

export default function NotificationsPage() {
  return (
    <RequirePermission anyOf={["notification:manage"]}>
      <Deliveries />
    </RequirePermission>
  );
}

function Deliveries() {
  const [f, set] = useUrlState({ status: "", channel: "", page: "1" });
  const q = usePagedQuery<Delivery>("deliveries", "/admin/notification-deliveries", { status: f.status, channel: f.channel, page: Number(f.page), pageSize: 25 });
  return (
    <>
      <PageHeader title="Notification log" description="Outbound email / SMS / WhatsApp. “Sent” means the configured provider accepted it. While a channel uses the console provider nothing leaves the server — see System health. Recipients are masked." />
      <Card pad={false}>
        <FilterBar>
          <Select aria-label="Channel" value={f.channel} onChange={(e) => set({ channel: e.target.value })} className="w-40"><option value="">All channels</option><option>EMAIL</option><option>SMS</option><option>WHATSAPP</option></Select>
          <Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="w-40"><option value="">Any status</option><option>QUEUED</option><option>SENT</option><option>FAILED</option><option>SKIPPED</option></Select>
        </FilterBar>
        <DataTable rows={q.rows} loading={q.isLoading || q.isFetching} error={q.error} onRetry={() => q.refetch()} rowKey={(d) => d.id} pageSize={25}
          empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No notification deliveries recorded.</p>}
          columns={[
            { key: "d", header: "Created", cell: (d) => <span className="whitespace-nowrap text-slate-600">{fmtDate(d.createdAt)}</span> },
            { key: "c", header: "Channel", cell: (d) => <Badge tone="accent">{d.channel}</Badge> },
            { key: "t", header: "Template", cell: (d) => <span className="font-mono text-xs">{d.template}</span> },
            { key: "r", header: "Recipient", cell: (d) => <span className="font-mono text-xs text-slate-600">{d.recipient}</span> },
            { key: "s", header: "Status", cell: (d) => <div><StatusBadge status={d.status} />{d.error && <p className="max-w-56 truncate text-xs text-rose-600" title={d.error}>{d.error}</p>}</div> },
            { key: "p", header: "Provider", cell: (d) => <span className="text-xs">{d.provider ?? "—"}{d.providerRef && <span className="block font-mono text-slate-400">{d.providerRef}</span>}</span> },
            { key: "a", header: "Attempts", align: "right", cell: (d) => d.attempts },
          ]} />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>
    </>
  );
}
