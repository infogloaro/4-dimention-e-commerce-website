"use client";

import { Download } from "lucide-react";
import { Fragment, useState } from "react";
import { exportCsv, usePagedQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { Badge, Btn, Card, DataTable, FilterBar, Input, PageHeader, Pagination, Select, useToast, useUrlState } from "@/components/admin/ui";
import { fmtDate } from "@/lib/admin/format";

interface Log { id: string; actorRole: string | null; action: string; resourceType: string | null; resourceId: string | null; ip: string | null; requestId: string | null; metadata: Record<string, unknown> | null; createdAt: string; actor: { name: string; email: string } | null }

export default function AuditPage() {
  return (
    <RequirePermission anyOf={["audit:read"]}>
      <Audit />
    </RequirePermission>
  );
}

function Audit() {
  const toast = useToast();
  const [f, set] = useUrlState({ action: "", resourceType: "", from: "", to: "", page: "1" });
  const params = { action: f.action || undefined, resourceType: f.resourceType || undefined, from: f.from ? `${f.from}T00:00:00+05:30` : undefined, to: f.to ? `${f.to}T23:59:59+05:30` : undefined };
  const q = usePagedQuery<Log>("audit", "/admin/audit-logs", { ...params, page: Number(f.page), pageSize: 50 });
  const [open, setOpen] = useState<string | null>(null);
  const [action, setAction] = useState(f.action);
  async function doExport() {
    try {
      const n = await exportCsv<Log>("/admin/audit-logs", params, [
        { key: "createdAt", label: "Time (UTC)" }, { key: "actor", label: "Actor", get: (l) => l.actor?.email ?? "system" }, { key: "actorRole", label: "Role" }, { key: "action", label: "Action" }, { key: "resourceType", label: "Resource" }, { key: "resourceId", label: "Resource id" },
      ], `audit-${new Date().toISOString().slice(0, 10)}.csv`, 2000);
      toast.success(`Exported ${n} entries`);
    } catch (e) { toast.fail(e); }
  }
  const tone = (a: string) => (/failed|locked|rejected|deleted|banned|cancel/.test(a) ? "danger" : /login|logout|registered/.test(a) ? "neutral" : "info");
  return (
    <>
      <PageHeader title="Audit logs" description="Immutable record of authentication and administrative actions. There is no edit or delete operation for audit entries in the API." actions={<Btn onClick={doExport}><Download className="size-4" /> Export CSV</Btn>} />
      <Card pad={false}>
        <FilterBar>
          <form onSubmit={(e) => { e.preventDefault(); set({ action }); }} className="flex gap-2"><Input aria-label="Action prefix" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action prefix, e.g. order." className="w-52" /><Btn type="submit">Filter</Btn></form>
          <Select aria-label="Resource type" value={f.resourceType} onChange={(e) => set({ resourceType: e.target.value })} className="w-40"><option value="">All resources</option>{["user", "order", "product", "variant", "refund", "return", "shipment", "coupon", "inventory", "settings", "role", "ticket", "review"].map((r) => <option key={r}>{r}</option>)}</Select>
          <Input type="date" aria-label="From" value={f.from} onChange={(e) => set({ from: e.target.value })} className="w-40" />
          <Input type="date" aria-label="To" value={f.to} onChange={(e) => set({ to: e.target.value })} className="w-40" />
        </FilterBar>
        <DataTable
          rows={q.rows} loading={q.isLoading || q.isFetching} error={q.error} onRetry={() => q.refetch()} rowKey={(l) => l.id} pageSize={50} onRowClick={(l) => setOpen(open === l.id ? null : l.id)}
          columns={[
            { key: "t", header: "Time (IST)", cell: (l) => <span className="whitespace-nowrap text-slate-600">{fmtDate(l.createdAt)}</span> },
            { key: "a", header: "Actor", cell: (l) => <div><p>{l.actor?.name ?? "system"}</p><p className="text-xs text-slate-500">{l.actorRole}</p></div> },
            { key: "ac", header: "Action", cell: (l) => <Badge tone={tone(l.action)}>{l.action}</Badge> },
            { key: "r", header: "Resource", cell: (l) => <span className="font-mono text-xs">{l.resourceType}{l.resourceId && ` · ${l.resourceId.slice(0, 8)}`}</span> },
            { key: "i", header: "IP", cell: (l) => <span className="font-mono text-xs text-slate-500">{l.ip}</span> },
            { key: "m", header: "Details", cell: (l) => (open === l.id ? <pre className="max-w-md whitespace-pre-wrap break-all text-xs">{JSON.stringify({ ...l.metadata, requestId: l.requestId }, null, 2)}</pre> : <span className="text-xs text-indigo-600">{l.metadata ? "View" : ""}</span>) },
          ]}
        />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>
      <Fragment />
    </>
  );
}
