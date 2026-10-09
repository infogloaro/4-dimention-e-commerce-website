"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { exportCsv, usePagedQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { Badge, Btn, Card, DataTable, FilterBar, PageHeader, Pagination, SearchBox, Select, StatusBadge, useToast, useUrlState } from "@/components/admin/ui";
import { fmtDate, fmtMoney } from "@/lib/admin/format";

interface CustomerRow { id: string; name: string; email: string; phone: string | null; status: string; emailVerifiedAt: string | null; ordersCount: number; lifetimeValue: number; lastLoginAt: string | null; createdAt: string }

export default function CustomersPage() {
  return (
    <RequirePermission anyOf={["customer:read"]}>
      <Customers />
    </RequirePermission>
  );
}

function Customers() {
  const router = useRouter();
  const toast = useToast();
  const [f, set] = useUrlState({ search: "", status: "", sort: "newest", page: "1" });
  const q = usePagedQuery<CustomerRow>("customers", "/admin/customers", { search: f.search, status: f.status, sort: f.sort, page: Number(f.page), pageSize: 20 });
  async function doExport() {
    try {
      // Data minimisation: no phone numbers or addresses in bulk exports.
      const n = await exportCsv<CustomerRow>("/admin/customers", { search: f.search, status: f.status, sort: f.sort }, [
        { key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "status", label: "Status" }, { key: "ordersCount", label: "Orders" }, { key: "lifetimeValue", label: "Lifetime value (paise)" }, { key: "createdAt", label: "Registered (UTC)" },
      ], `customers-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`Exported ${n} customers (phone numbers and addresses excluded)`);
    } catch (e) { toast.fail(e); }
  }
  return (
    <>
      <PageHeader title="Customers" description="Registered shoppers. Staff accounts are managed under Staff & Security. Lifetime value counts paid orders net of refunds." actions={<Btn onClick={doExport}><Download className="size-4" /> Export CSV</Btn>} />
      <Card pad={false}>
        <FilterBar>
          <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="Name, email, phone" />
          <Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="w-44"><option value="">All statuses</option>{["ACTIVE", "SUSPENDED", "BANNED", "PENDING_VERIFICATION"].map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}</Select>
          <Select aria-label="Sort" value={f.sort} onChange={(e) => set({ sort: e.target.value })} className="w-40"><option value="newest">Newest</option><option value="spend">Highest spend</option><option value="orders">Most orders</option></Select>
        </FilterBar>
        <DataTable
          rows={q.rows} loading={q.isLoading || q.isFetching} error={q.error} onRetry={() => q.refetch()} rowKey={(c) => c.id} pageSize={20} onRowClick={(c) => router.push(`/admin/customers/${c.id}`)}
          columns={[
            { key: "n", header: "Customer", cell: (c) => <div><p className="font-medium">{c.name}</p><p className="text-xs text-slate-500">{c.email}</p></div> },
            { key: "s", header: "Status", cell: (c) => <div className="flex gap-1.5"><StatusBadge status={c.status} />{!c.emailVerifiedAt && <Badge tone="warning">Unverified</Badge>}</div> },
            { key: "o", header: "Orders", align: "right", cell: (c) => c.ordersCount },
            { key: "l", header: "Lifetime value", align: "right", cell: (c) => fmtMoney(c.lifetimeValue) },
            { key: "ll", header: "Last login", cell: (c) => <span className="text-slate-600">{fmtDate(c.lastLoginAt)}</span> },
            { key: "r", header: "Registered", cell: (c) => <span className="text-slate-600">{fmtDate(c.createdAt, false)}</span> },
          ]}
          empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No customers match.</p>}
        />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>
    </>
  );
}
