"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { exportCsv, usePagedQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { Badge, Btn, Card, DataTable, FilterBar, Input, PageHeader, Pagination, SearchBox, Select, StatusBadge, Tabs, useToast, useUrlState } from "@/components/admin/ui";
import { fmtDate, fmtMoney, titleCase } from "@/lib/admin/format";

interface Payment { id: string; orderId: string; provider: string; method: string | null; status: string; amount: number; currency: string; providerPaymentId: string | null; providerChargeId: string | null; failureCode: string | null; failureReason: string | null; paidAt: string | null; createdAt: string; order: { orderNumber: string; paymentStatus: string; customerName: string } }
interface Hook { id: string; provider: string; eventId: string; type: string; status: string; error: string | null; receivedAt: string; processedAt: string | null }

export default function PaymentsPage() {
  return (
    <RequirePermission anyOf={["order:read"]}>
      <Payments />
    </RequirePermission>
  );
}

function Payments() {
  const toast = useToast();
  const [f, set] = useUrlState({ tab: "transactions", search: "", status: "", provider: "", from: "", to: "", wstatus: "", page: "1" });
  const range = { from: f.from ? `${f.from}T00:00:00+05:30` : undefined, to: f.to ? `${f.to}T23:59:59+05:30` : undefined };
  const tx = usePagedQuery<Payment>("payments", "/admin/payments", { search: f.search, status: f.status, provider: f.provider, ...range, page: Number(f.page), pageSize: 20 }, f.tab === "transactions");
  const wh = usePagedQuery<Hook>("webhooks", "/admin/payments/webhooks", { status: f.wstatus, provider: f.provider, page: Number(f.page), pageSize: 20 }, f.tab === "webhooks");
  async function doExport() {
    try {
      const n = await exportCsv<Payment>("/admin/payments", { search: f.search, status: f.status, provider: f.provider, ...range }, [
        { key: "createdAt", label: "Created (UTC)" }, { key: "order", label: "Order", get: (p) => p.order.orderNumber }, { key: "provider", label: "Provider" }, { key: "method", label: "Method" }, { key: "status", label: "Status" },
        { key: "amount", label: "Amount (paise)" }, { key: "currency", label: "Currency" }, { key: "providerPaymentId", label: "Provider ref" }, { key: "paidAt", label: "Paid (UTC)" },
      ], `payments-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`Exported ${n} transactions`);
    } catch (e) { toast.fail(e); }
  }
  return (
    <>
      <PageHeader title="Payments & transactions" description="Payment status comes only from server-verified provider events or capture of cash on delivery — never from a browser redirect. Refunds are under Refunds; this view is read-only." actions={f.tab === "transactions" && <Btn onClick={doExport}><Download className="size-4" /> Export CSV</Btn>} />
      <Card pad={false}>
        <div className="px-2 pt-1"><Tabs tabs={[{ id: "transactions", label: "Transactions" }, { id: "webhooks", label: "Provider webhook events" }]} value={f.tab} onChange={(v) => set({ tab: v })} /></div>
        {f.tab === "transactions" ? (
          <>
            <FilterBar>
              <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="Order # or provider reference" />
              <Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="w-44"><option value="">Any status</option>{["CREATED", "REQUIRES_ACTION", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
              <Select aria-label="Provider" value={f.provider} onChange={(e) => set({ provider: e.target.value })} className="w-36"><option value="">Any provider</option>{["COD", "RAZORPAY", "STRIPE", "MOCK"].map((s) => <option key={s}>{s}</option>)}</Select>
              <Input type="date" aria-label="From" value={f.from} onChange={(e) => set({ from: e.target.value })} className="w-40" /><Input type="date" aria-label="To" value={f.to} onChange={(e) => set({ to: e.target.value })} className="w-40" />
            </FilterBar>
            <DataTable rows={tx.rows} loading={tx.isLoading || tx.isFetching} error={tx.error} onRetry={() => tx.refetch()} rowKey={(p) => p.id} pageSize={20}
              empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No transactions match.</p>}
              columns={[
                { key: "d", header: "Created", cell: (p) => <span className="whitespace-nowrap text-slate-600">{fmtDate(p.createdAt)}</span> },
                { key: "o", header: "Order", cell: (p) => <div><Link href={`/admin/orders/${p.orderId}`} className="font-medium text-indigo-700 hover:underline">{p.order.orderNumber}</Link><p className="text-xs text-slate-500">{p.order.customerName}</p></div> },
                { key: "pm", header: "Provider", cell: (p) => <div><p>{p.provider}{p.provider === "MOCK" && <Badge tone="warning" className="ml-1.5">simulated</Badge>}</p><p className="text-xs text-slate-500">{p.method}</p></div> },
                { key: "a", header: "Amount", align: "right", cell: (p) => fmtMoney(p.amount, p.currency) },
                { key: "s", header: "Attempt", cell: (p) => <div><StatusBadge status={p.status} kind="attempt" />{p.failureReason && <p className="mt-0.5 max-w-48 truncate text-xs text-rose-600" title={p.failureReason}>{p.failureReason}</p>}</div> },
                { key: "os", header: "Order payment", cell: (p) => <StatusBadge status={p.order.paymentStatus} kind="payment" /> },
                { key: "r", header: "Provider ref", cell: (p) => <span className="font-mono text-xs text-slate-500">{p.providerPaymentId ?? "—"}</span> },
              ]} />
            <Pagination meta={tx.meta} onPage={(p) => set({ page: String(p) }, false)} />
          </>
        ) : (
          <>
            <FilterBar><Select aria-label="Webhook status" value={f.wstatus} onChange={(e) => set({ wstatus: e.target.value })} className="w-44"><option value="">Any outcome</option>{["RECEIVED", "PROCESSED", "IGNORED", "FAILED"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
              <span className="text-xs text-slate-500">Events are signature-verified and de-duplicated by provider + event id; “Ignored” usually means a duplicate delivery.</span></FilterBar>
            <DataTable rows={wh.rows} loading={wh.isLoading || wh.isFetching} error={wh.error} onRetry={() => wh.refetch()} rowKey={(h) => h.id} pageSize={20}
              empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No webhook events received.</p>}
              columns={[
                { key: "d", header: "Received", cell: (h) => <span className="text-slate-600">{fmtDate(h.receivedAt)}</span> },
                { key: "p", header: "Provider", cell: (h) => h.provider },
                { key: "t", header: "Type", cell: (h) => <span className="font-mono text-xs">{h.type}</span> },
                { key: "e", header: "Event id", cell: (h) => <span className="font-mono text-xs text-slate-500">{h.eventId}</span> },
                { key: "s", header: "Outcome", cell: (h) => <div><StatusBadge status={h.status} />{h.error && <p className="max-w-56 truncate text-xs text-rose-600" title={h.error}>{h.error}</p>}</div> },
              ]} />
            <Pagination meta={wh.meta} onPage={(p) => set({ page: String(p) }, false)} />
          </>
        )}
      </Card>
    </>
  );
}
