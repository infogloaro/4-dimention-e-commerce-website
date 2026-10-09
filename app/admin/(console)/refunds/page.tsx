"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdminMutation, usePagedQuery } from "@/components/admin/data";
import { RequirePermission, useAuth } from "@/components/admin/providers";
import { Btn, Card, ConfirmDialog, DataTable, FilterBar, PageHeader, Pagination, SearchBox, Select, StatusBadge, useUrlState } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";
import { fmtDate, fmtMoney, titleCase } from "@/lib/admin/format";

interface Refund { id: string; orderId: string; returnRequestId: string | null; amount: number; status: string; reason: string | null; providerRefundId: string | null; failureReason: string | null; processedAt: string | null; createdAt: string; order: { orderNumber: string; currency: string; grandTotal: number; refundedTotal: number }; payment: { provider: string; method: string | null } | null }

export default function RefundsPage() {
  return (
    <RequirePermission anyOf={["order:refund", "order:read"]}>
      <Refunds />
    </RequirePermission>
  );
}

function Refunds() {
  const { can } = useAuth();
  const [f, set] = useUrlState({ search: "", status: "", page: "1" });
  const q = usePagedQuery<Refund>("refunds", "/admin/refunds", { search: f.search, status: f.status, page: Number(f.page), pageSize: 20 });
  const [target, setTarget] = useState<Refund | null>(null);
  const m = useAdminMutation(() => api.post(`/admin/refunds/${target!.id}/process`), { success: "Refund marked as paid out", onSuccess: () => setTarget(null) });
  return (
    <>
      <PageHeader title="Refunds" description="A refund is shown as completed only after the payment provider confirms it (online) or staff confirm the manual payout (COD / bank transfer). Issue new refunds from the order page." />
      <Card pad={false}>
        <FilterBar>
          <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="Order # or provider refund id" />
          <Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="w-44"><option value="">Any status</option>{["PENDING", "PROCESSING", "SUCCEEDED", "FAILED"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
        </FilterBar>
        <DataTable rows={q.rows} loading={q.isLoading || q.isFetching} error={q.error} onRetry={() => q.refetch()} rowKey={(r) => r.id} pageSize={20}
          empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No refunds recorded.</p>}
          columns={[
            { key: "d", header: "Requested", cell: (r) => <span className="whitespace-nowrap text-slate-600">{fmtDate(r.createdAt)}</span> },
            { key: "o", header: "Order", cell: (r) => <Link href={`/admin/orders/${r.orderId}`} className="font-medium text-indigo-700 hover:underline">{r.order.orderNumber}</Link> },
            { key: "a", header: "Amount", align: "right", cell: (r) => <div><p>{fmtMoney(r.amount, r.order.currency)}</p><p className="text-[11px] text-slate-500">of {fmtMoney(r.order.grandTotal, r.order.currency)}</p></div> },
            { key: "m", header: "Via", cell: (r) => <span className="text-xs">{r.payment?.provider ?? "—"}{r.returnRequestId && " · return"}</span> },
            { key: "r", header: "Reason", cell: (r) => <span className="max-w-56 truncate text-xs text-slate-600" title={r.reason ?? ""}>{r.reason ?? "—"}</span> },
            { key: "s", header: "Status", cell: (r) => <div><StatusBadge status={r.status} kind="refund" />{r.failureReason && <p className="max-w-48 truncate text-xs text-rose-600" title={r.failureReason}>{r.failureReason}</p>}{r.processedAt && <p className="text-[11px] text-slate-500">{fmtDate(r.processedAt)}</p>}</div> },
            { key: "act", header: <span className="sr-only">Actions</span>, align: "right", cell: (r) => can("order:refund") && r.status === "PENDING" && r.payment?.provider === "COD" && <Btn size="sm" variant="primary" onClick={() => setTarget(r)}>Mark paid out</Btn> },
          ]} />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>
      <ConfirmDialog open={!!target} onClose={() => setTarget(null)} busy={m.isPending} title="Confirm offline refund" confirmLabel="Yes, money was paid out" onConfirm={() => m.mutate()}
        description={target && <p>{fmtMoney(target.amount, target.order.currency)} for order <strong>{target.order.orderNumber}</strong>.</p>}
        impact="Only confirm once the money has actually left your account. The refund becomes completed and the order’s payment status is updated. Audited; cannot be undone." />
    </>
  );
}
