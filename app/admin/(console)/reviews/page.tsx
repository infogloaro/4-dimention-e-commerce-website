"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { useAdminMutation, usePagedQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { Badge, Btn, Card, ConfirmDialog, DataTable, FilterBar, PageHeader, Pagination, Select, StatusBadge, useUrlState } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";
import { fmtDate } from "@/lib/admin/format";

interface Review { id: string; rating: number; title: string | null; body: string | null; isVerifiedPurchase: boolean; status: string; helpfulCount: number; rejectionReason: string | null; createdAt: string; user: { name: string; email: string }; product: { name: string; slug: string } }

export default function ReviewsPage() {
  return (
    <RequirePermission anyOf={["review:moderate"]}>
      <Reviews />
    </RequirePermission>
  );
}

function Reviews() {
  const [f, set] = useUrlState({ status: "PENDING", page: "1" });
  const q = usePagedQuery<Review>("reviews", "/admin/reviews", { status: f.status, page: Number(f.page), pageSize: 20 });
  const [rej, setRej] = useState<Review | null>(null);
  const moderate = useAdminMutation((v: { id: string; approve: boolean; reason?: string }) => api.post(`/admin/reviews/${v.id}/moderate`, { approve: v.approve, reason: v.reason }), { success: "Review moderated (product rating recalculated)", onSuccess: () => setRej(null) });
  return (
    <>
      <PageHeader title="Product reviews" description="Moderate customer reviews. Approving or rejecting recalculates the product’s aggregate rating on the server. Ratings and text can’t be edited here." />
      <Card pad={false}>
        <FilterBar>
          <Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="w-44"><option value="">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></Select>
        </FilterBar>
        <DataTable
          rows={q.rows} loading={q.isLoading || q.isFetching} error={q.error} onRetry={() => q.refetch()} rowKey={(r) => r.id} pageSize={20}
          empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No reviews in this view.</p>}
          columns={[
            { key: "r", header: "Rating", cell: (r) => <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${r.rating} out of 5`}>{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`size-3.5 ${i < r.rating ? "fill-current" : "text-slate-300"}`} />)}</span> },
            { key: "c", header: "Review", cell: (r) => <div className="max-w-md"><p className="font-medium">{r.title}</p><p className="line-clamp-2 text-xs text-slate-600">{r.body}</p><p className="mt-0.5 text-[11px] text-slate-400">{r.user.name} · {fmtDate(r.createdAt, false)}</p></div> },
            { key: "p", header: "Product", cell: (r) => r.product.name },
            { key: "v", header: "Verified", cell: (r) => (r.isVerifiedPurchase ? <Badge tone="success">Verified purchase</Badge> : <Badge>Unverified</Badge>) },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { key: "a", header: <span className="sr-only">Actions</span>, align: "right", cell: (r) => (
              <div className="flex justify-end gap-1.5">
                {r.status !== "APPROVED" && <Btn size="sm" variant="primary" onClick={() => moderate.mutate({ id: r.id, approve: true })}>Approve</Btn>}
                {r.status !== "REJECTED" && <Btn size="sm" onClick={() => setRej(r)}>Reject</Btn>}
              </div>
            ) },
          ]}
        />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>
      <ConfirmDialog open={!!rej} onClose={() => setRej(null)} busy={moderate.isPending} danger title="Reject review?" confirmLabel="Reject review" reasonLabel="Reason (audited)" onConfirm={(reason) => { if (rej) moderate.mutate({ id: rej.id, approve: false, reason }); }} impact="The review is hidden from the storefront and removed from the product’s average rating." />
    </>
  );
}
