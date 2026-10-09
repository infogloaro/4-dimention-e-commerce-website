"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useState } from "react";
import { useAdminMutation, usePagedQuery } from "@/components/admin/data";
import { RequirePermission, useAuth } from "@/components/admin/providers";
import { Btn, Card, DataTable, Field, FilterBar, Input, Modal, PageHeader, Pagination, Select, StatusBadge, Textarea, useUrlState } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";
import { fmtDate, fmtMoney, titleCase } from "@/lib/admin/format";

interface ReturnRow {
  id: string; number: string; orderId: string; status: string; resolution: string; reason: string; details: string | null; evidenceUrls: string[]; adminNote: string | null;
  pickupScheduledAt: string | null; receivedAt: string | null; createdAt: string;
  items: { id: string; quantity: number; reason: string | null; orderItem: { name: string; variantName: string | null } }[];
  order: { orderNumber: string }; user: { name: string; email: string }; refunds: { id: string; amount: number; status: string }[];
}

const STATUSES = ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "PICKED_UP", "RECEIVED", "REFUND_PENDING", "COMPLETED", "REJECTED", "CANCELLED"];

export default function ReturnsPage() {
  return (
    <RequirePermission anyOf={["return:manage"]}>
      <Returns />
    </RequirePermission>
  );
}

type Action = { kind: "decide"; row: ReturnRow; approve: boolean } | { kind: "advance"; row: ReturnRow; to: "PICKUP_SCHEDULED" | "PICKED_UP" | "RECEIVED" } | null;

function Returns() {
  const { can } = useAuth();
  const [f, set] = useUrlState({ status: "", page: "1" });
  const q = usePagedQuery<ReturnRow>("returns", "/admin/returns", { status: f.status || undefined, page: Number(f.page), pageSize: 20 });
  const [action, setAction] = useState<Action>(null);
  const [detail, setDetail] = useState<ReturnRow | null>(null);
  return (
    <>
      <PageHeader title="Returns & exchanges" description="Return requests move Requested → Approved → Pickup → Received. Receiving restocks the returned units and triggers the refund through the refund workflow. Exchanges are fulfilled as replacements recorded on the request." />
      <Card pad={false}>
        <FilterBar>
          <Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="w-52">
            <option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </Select>
        </FilterBar>
        <DataTable
          rows={q.rows} loading={q.isLoading || q.isFetching} error={q.error} onRetry={() => q.refetch()} rowKey={(r) => r.id} pageSize={20} onRowClick={setDetail}
          empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No return requests.</p>}
          columns={[
            { key: "n", header: "Return", cell: (r) => <div><p className="font-mono font-medium">{r.number}</p><p className="text-xs text-slate-500">{fmtDate(r.createdAt)}</p></div> },
            { key: "o", header: "Order", cell: (r) => <Link href={`/admin/orders/${r.orderId}`} onClick={(e) => e.stopPropagation()} className="text-indigo-700 hover:underline">{r.order.orderNumber}</Link> },
            { key: "c", header: "Customer", cell: (r) => <div><p>{r.user.name}</p><p className="text-xs text-slate-500">{r.user.email}</p></div> },
            { key: "i", header: "Items", cell: (r) => <span className="text-xs">{r.items.map((i) => `${i.quantity}× ${i.orderItem.name}`).join(", ")}</span> },
            { key: "rs", header: "Reason / resolution", cell: (r) => <div className="text-xs"><p>{r.reason}</p><p className="text-slate-500">{titleCase(r.resolution)}</p></div> },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} kind="return" /> },
            { key: "a", header: <span className="sr-only">Actions</span>, align: "right", cell: (r) => can("return:manage") && (
              <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                {r.status === "REQUESTED" && <><Btn size="sm" variant="primary" onClick={() => setAction({ kind: "decide", row: r, approve: true })}>Approve</Btn><Btn size="sm" onClick={() => setAction({ kind: "decide", row: r, approve: false })}>Reject</Btn></>}
                {r.status === "APPROVED" && <Btn size="sm" onClick={() => setAction({ kind: "advance", row: r, to: "PICKUP_SCHEDULED" })}>Schedule pickup</Btn>}
                {r.status === "PICKUP_SCHEDULED" && <Btn size="sm" onClick={() => setAction({ kind: "advance", row: r, to: "PICKED_UP" })}>Mark picked up</Btn>}
                {(r.status === "PICKED_UP" || r.status === "APPROVED") && <Btn size="sm" variant="primary" onClick={() => setAction({ kind: "advance", row: r, to: "RECEIVED" })}>Mark received</Btn>}
              </div>
            ) },
          ]}
        />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>
      {action && <ActionDialog action={action} onClose={() => setAction(null)} />}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Return ${detail.number}` : ""}>
        {detail && (
          <div className="space-y-3 text-sm">
            <p><strong>{detail.user.name}</strong> · order {detail.order.orderNumber}</p>
            <p><span className="text-slate-500">Reason:</span> {detail.reason}{detail.details && <><br /><span className="text-slate-500">Details:</span> {detail.details}</>}</p>
            <ul className="list-disc pl-5">{detail.items.map((i) => <li key={i.id}>{i.quantity}× {i.orderItem.name}{i.orderItem.variantName && ` (${i.orderItem.variantName})`}{i.reason && ` — ${i.reason}`}</li>)}</ul>
            {detail.evidenceUrls.length > 0 && <div className="flex flex-wrap gap-2">{detail.evidenceUrls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="Customer evidence" className="size-20 rounded-md border object-cover" /></a>)}</div>}
            {detail.adminNote && <p><span className="text-slate-500">Staff note:</span> {detail.adminNote}</p>}
            {detail.pickupScheduledAt && <p><span className="text-slate-500">Pickup:</span> {fmtDate(detail.pickupScheduledAt)}</p>}
            {detail.receivedAt && <p><span className="text-slate-500">Received:</span> {fmtDate(detail.receivedAt)}</p>}
            {detail.refunds.length > 0 && <p><span className="text-slate-500">Refunds:</span> {detail.refunds.map((r) => `${fmtMoney(r.amount)} (${titleCase(r.status)})`).join(", ")}</p>}
            <p className="text-xs text-slate-500">Condition/inspection grading is not part of the current data model; units are restocked when marked received.</p>
          </div>
        )}
      </Modal>
    </>
  );
}

function ActionDialog({ action, onClose }: { action: NonNullable<Action>; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const r = action.row;
  const m = useAdminMutation(() => action.kind === "decide"
    ? api.post(`/admin/returns/${r.id}/decision`, { approve: action.approve, note: note || undefined, pickupScheduledAt: action.approve && when ? new Date(when).toISOString() : undefined })
    : api.post(`/admin/returns/${r.id}/advance`, { status: action.to, note: note || undefined, pickupScheduledAt: action.to === "PICKUP_SCHEDULED" && when ? new Date(when).toISOString() : undefined }), { success: "Return updated", onSuccess: onClose });
  const title = action.kind === "decide" ? (action.approve ? "Approve return" : "Reject return") : action.to === "RECEIVED" ? "Mark return received" : action.to === "PICKED_UP" ? "Mark picked up" : "Schedule pickup";
  const needNote = action.kind === "decide" && !action.approve;
  const receiving = action.kind === "advance" && action.to === "RECEIVED";
  return (
    <Modal open onClose={onClose} title={`${title} · ${r.number}`} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant={needNote ? "danger" : "primary"} disabled={needNote && note.trim().length < 3} loading={m.isPending} onClick={() => m.mutate()}>{title}</Btn></>}>
      <div className="space-y-3">
        {receiving && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">Only confirm after physically receiving and checking the goods. Returned units are restocked and the refund is started automatically (COD refunds stay pending until paid out). This cannot be undone.</p>}
        {((action.kind === "decide" && action.approve) || (action.kind === "advance" && action.to === "PICKUP_SCHEDULED")) && <Field label="Pickup date/time (optional)">{(id) => <Input id={id} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}</Field>}
        <Field label={needNote ? "Reason shown to the customer" : "Note (optional)"} required={needNote}>{(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />}</Field>
      </div>
    </Modal>
  );
}
