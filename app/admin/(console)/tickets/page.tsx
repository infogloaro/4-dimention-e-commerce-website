"use client";

import { useState } from "react";
import { useAdminMutation, useDataQuery, usePagedQuery } from "@/components/admin/data";
import { RequirePermission, useAuth } from "@/components/admin/providers";
import { Btn, Card, DataTable, ErrorState, Field, FilterBar, Modal, PageHeader, Pagination, SearchBox, Select, Spinner, StatusBadge, Textarea, useUrlState } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";
import { fmtDate, timeAgo, titleCase } from "@/lib/admin/format";

interface Ticket { id: string; number: string; subject: string; category: string; status: string; orderId: string | null; createdAt: string; updatedAt: string; user: { name: string; email: string }; _count: { messages: number } }
interface TicketDetail extends Ticket { messages: { id: string; isStaff: boolean; body: string; createdAt: string }[] }
const STATUSES = ["OPEN", "PENDING_CUSTOMER", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export default function TicketsPage() {
  return (
    <RequirePermission anyOf={["support:read"]}>
      <Tickets />
    </RequirePermission>
  );
}

function Tickets() {
  const [f, set] = useUrlState({ search: "", status: "", page: "1" });
  const q = usePagedQuery<Ticket>("tickets", "/admin/tickets", { search: f.search, status: f.status, page: Number(f.page), pageSize: 20 });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Support tickets" description="Customer enquiries, order and return questions. Replies notify the customer through the configured channels (email/SMS use the console provider until a real provider is registered)." />
      <Card pad={false}>
        <FilterBar>
          <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="Ticket # or subject" />
          <Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="w-48"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
        </FilterBar>
        <DataTable
          rows={q.rows} loading={q.isLoading || q.isFetching} error={q.error} onRetry={() => q.refetch()} rowKey={(t) => t.id} pageSize={20} onRowClick={(t) => setOpen(t.id)}
          empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No tickets match.</p>}
          columns={[
            { key: "n", header: "Ticket", cell: (t) => <div><p className="font-mono text-xs text-slate-500">{t.number}</p><p className="font-medium">{t.subject}</p></div> },
            { key: "c", header: "Customer", cell: (t) => <div><p>{t.user.name}</p><p className="text-xs text-slate-500">{t.user.email}</p></div> },
            { key: "k", header: "Category", cell: (t) => titleCase(t.category) },
            { key: "m", header: "Msgs", align: "right", cell: (t) => t._count.messages },
            { key: "s", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
            { key: "u", header: "Updated", cell: (t) => <span className="text-slate-600">{timeAgo(t.updatedAt)}</span> },
          ]}
        />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>
      {open && <TicketModal id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function TicketModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const q = useDataQuery<TicketDetail>(["ticket", id], `/admin/tickets/${id}`);
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState("PENDING_CUSTOMER");
  const reply = useAdminMutation(() => api.post(`/admin/tickets/${id}`, { message: msg.trim(), status }), { success: "Reply sent", onSuccess: () => setMsg("") });
  const setSt = useAdminMutation((s: string) => api.patch(`/admin/tickets/${id}`, { status: s }), { success: "Status updated" });
  const t = q.data;
  return (
    <Modal open wide onClose={onClose} title={t ? `${t.number} · ${t.subject}` : "Ticket"}>
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !t ? <Spinner /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{t.user.name} · {t.user.email} · opened {fmtDate(t.createdAt)}</span>
            {can("support:reply") && <Select aria-label="Ticket status" value={t.status} onChange={(e) => setSt.mutate(e.target.value)} className="w-44">{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>}</div>
          <ol className="space-y-2.5">
            {t.messages.map((m) => <li key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.isStaff ? "ml-auto bg-indigo-50 text-indigo-950" : "bg-slate-100 text-slate-800"}`}><p className="whitespace-pre-wrap">{m.body}</p><p className="mt-1 text-[11px] opacity-60">{m.isStaff ? "Staff" : "Customer"} · {fmtDate(m.createdAt)}</p></li>)}
          </ol>
          {can("support:reply") && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <Field label="Reply to customer (sent to the customer)">{(fid) => <Textarea id={fid} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={4000} />}</Field>
              <div className="flex items-center justify-between gap-2"><Select aria-label="Status after reply" value={status} onChange={(e) => setStatus(e.target.value)} className="w-52">{STATUSES.map((s) => <option key={s} value={s}>Set to: {titleCase(s)}</option>)}</Select>
                <Btn variant="primary" disabled={!msg.trim()} loading={reply.isPending} onClick={() => reply.mutate()}>Send reply</Btn></div>
              <p className="text-xs text-slate-500">Internal-only notes are not supported by the current data model; every message is customer-visible.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
