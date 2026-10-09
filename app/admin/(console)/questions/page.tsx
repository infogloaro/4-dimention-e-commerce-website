"use client";

import { useState } from "react";
import { useAdminMutation, usePagedQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { Btn, Card, DataTable, Field, FilterBar, Modal, PageHeader, Pagination, Select, StatusBadge, Textarea, useUrlState } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";
import { fmtDate } from "@/lib/admin/format";

interface Question { id: string; question: string; status: string; createdAt: string; product: { name: string }; answers: { id: string; body: string }[] }

export default function QuestionsPage() {
  return (
    <RequirePermission anyOf={["review:moderate"]}>
      <Questions />
    </RequirePermission>
  );
}

function Questions() {
  const [f, set] = useUrlState({ status: "PENDING", page: "1" });
  const q = usePagedQuery<Question>("questions", "/admin/questions", { status: f.status, page: Number(f.page), pageSize: 20 });
  const [answering, setAnswering] = useState<Question | null>(null);
  const [body, setBody] = useState("");
  const moderate = useAdminMutation((v: { id: string; approve: boolean }) => api.patch(`/admin/questions/${v.id}`, { approve: v.approve }), { success: "Question updated" });
  const answer = useAdminMutation(() => api.post(`/admin/questions/${answering!.id}`, { body: body.trim() }), { success: "Official answer published", onSuccess: () => { setAnswering(null); setBody(""); } });
  return (
    <>
      <PageHeader title="Product questions" description="Customer questions on product pages. Posting an official answer also approves the question." />
      <Card pad={false}>
        <FilterBar><Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="w-44"><option value="">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></Select></FilterBar>
        <DataTable
          rows={q.rows} loading={q.isLoading || q.isFetching} error={q.error} onRetry={() => q.refetch()} rowKey={(r) => r.id} pageSize={20}
          empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No questions in this view.</p>}
          columns={[
            { key: "q", header: "Question", cell: (r) => <div className="max-w-lg"><p className="font-medium">{r.question}</p>{r.answers.map((a) => <p key={a.id} className="mt-1 border-l-2 border-indigo-300 pl-2 text-xs text-slate-600">{a.body}</p>)}</div> },
            { key: "p", header: "Product", cell: (r) => r.product.name },
            { key: "d", header: "Asked", cell: (r) => <span className="text-slate-600">{fmtDate(r.createdAt, false)}</span> },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { key: "a", header: <span className="sr-only">Actions</span>, align: "right", cell: (r) => (
              <div className="flex justify-end gap-1.5">
                <Btn size="sm" variant="primary" onClick={() => setAnswering(r)}>Answer</Btn>
                {r.status !== "APPROVED" && <Btn size="sm" onClick={() => moderate.mutate({ id: r.id, approve: true })}>Approve</Btn>}
                {r.status !== "REJECTED" && <Btn size="sm" variant="ghost" onClick={() => moderate.mutate({ id: r.id, approve: false })}>Reject</Btn>}
              </div>
            ) },
          ]}
        />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>
      <Modal open={!!answering} onClose={() => setAnswering(null)} title="Official answer" footer={<><Btn onClick={() => setAnswering(null)}>Cancel</Btn><Btn variant="primary" disabled={body.trim().length < 2} loading={answer.isPending} onClick={() => answer.mutate()}>Publish answer</Btn></>}>
        <p className="mb-3 text-sm text-slate-700">“{answering?.question}”</p>
        <Field label="Answer" required>{(id) => <Textarea id={id} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />}</Field>
      </Modal>
    </>
  );
}
