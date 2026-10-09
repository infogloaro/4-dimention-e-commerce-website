"use client";

import { usePagedQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { Badge, Card, DataTable, FilterBar, PageHeader, Pagination, Select, useUrlState } from "@/components/admin/ui";
import { fmtDate, titleCase } from "@/lib/admin/format";

interface Movement { id: string; type: string; quantityDelta: number; reservedDelta: number; quantityAfter: number; reservedAfter: number; reason: string | null; refType: string | null; actorId: string | null; createdAt: string; sku: string; productName: string }

export default function MovementsPage() {
  return (
    <RequirePermission anyOf={["inventory:read"]}>
      <Movements />
    </RequirePermission>
  );
}

function Movements() {
  const [f, set] = useUrlState({ type: "", page: "1" });
  const q = usePagedQuery<Movement>("movements", "/admin/inventory/movements", { type: f.type, page: Number(f.page), pageSize: 30 });
  return (
    <>
      <PageHeader title="Stock movements" description="The append-only inventory ledger: every sale, reservation, release, return, restock and manual adjustment with the resulting balance." />
      <Card pad={false}>
        <FilterBar>
          <Select aria-label="Movement type" value={f.type} onChange={(e) => set({ type: e.target.value })} className="w-48">
            <option value="">All movement types</option>
            {["RESTOCK", "SALE", "RESERVE", "RELEASE", "ADJUSTMENT", "RETURN", "DAMAGE", "CORRECTION"].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </Select>
        </FilterBar>
        <DataTable
          rows={q.rows} loading={q.isLoading || q.isFetching} error={q.error} onRetry={() => q.refetch()} rowKey={(m) => m.id} pageSize={30}
          columns={[
            { key: "d", header: "When", cell: (m) => <span className="text-slate-600">{fmtDate(m.createdAt)}</span> },
            { key: "p", header: "Product", cell: (m) => <div><p className="font-medium">{m.productName}</p><p className="font-mono text-xs text-slate-500">{m.sku}</p></div> },
            { key: "t", header: "Type", cell: (m) => <Badge tone={m.quantityDelta < 0 ? "warning" : "info"}>{titleCase(m.type)}</Badge> },
            { key: "q", header: "Δ on hand", align: "right", cell: (m) => <span className={m.quantityDelta < 0 ? "text-rose-600" : m.quantityDelta > 0 ? "text-emerald-700" : "text-slate-400"}>{m.quantityDelta > 0 ? "+" : ""}{m.quantityDelta}</span> },
            { key: "r", header: "Δ reserved", align: "right", cell: (m) => (m.reservedDelta ? `${m.reservedDelta > 0 ? "+" : ""}${m.reservedDelta}` : "—") },
            { key: "a", header: "Balance", align: "right", cell: (m) => `${m.quantityAfter} / ${m.reservedAfter} res.` },
            { key: "w", header: "Reason", cell: (m) => <span className="text-slate-600">{m.reason ?? m.refType ?? "—"}</span> },
          ]}
        />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>
    </>
  );
}
