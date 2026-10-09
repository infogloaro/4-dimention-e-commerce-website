"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAdminMutation, useDataQuery } from "@/components/admin/data";
import { RequirePermission, useAuth } from "@/components/admin/providers";
import { Btn, Card, ConfirmDialog, DL, ErrorState, PageHeader, Skeleton, StatusBadge } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";
import { fmtDate, fmtMoney } from "@/lib/admin/format";

interface Customer {
  id: string; name: string; email: string; phone: string | null; status: string; emailVerifiedAt: string | null; phoneVerifiedAt: string | null; marketingOptIn: boolean;
  ordersCount: number; lifetimeValue: number; averageOrderValue: number; lastLoginAt: string | null; lastLoginIp: string | null; createdAt: string;
  addresses: { id: string; fullName: string; line1: string; city: string; state: string; postalCode: string; isDefault?: boolean }[];
  counts: { reviews: number; wishlist: number; returns: number; tickets: number };
  recentOrders: { id: string; orderNumber: string; status: string; paymentStatus?: string; grandTotal: number; createdAt: string }[];
}

export default function CustomerPage() {
  return (
    <RequirePermission anyOf={["customer:read"]}>
      <Detail />
    </RequirePermission>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const q = useDataQuery<Customer>(["customer", id], `/admin/customers/${id}`);
  const [target, setTarget] = useState<"ACTIVE" | "SUSPENDED" | "BANNED" | null>(null);
  const m = useAdminMutation((reason: string) => api.patch(`/admin/customers/${id}/status`, { status: target, reason: reason || undefined }), { success: "Customer status updated", onSuccess: () => setTarget(null) });
  if (q.error) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const c = q.data;
  if (!c) return <Skeleton className="h-96 w-full" />;
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Customers", href: "/admin/customers" }, { label: c.name }]} title={c.name} description={c.email}
        actions={<>
          <StatusBadge status={c.status} />
          {can("customer:write") && c.status === "ACTIVE" && <><Btn onClick={() => setTarget("SUSPENDED")}>Suspend</Btn><Btn variant="danger" onClick={() => setTarget("BANNED")}>Ban</Btn></>}
          {can("customer:write") && (c.status === "SUSPENDED" || c.status === "BANNED") && <Btn variant="primary" onClick={() => setTarget("ACTIVE")}>Reactivate</Btn>}
        </>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Order history" pad={false}>
            {c.recentOrders.length === 0 ? <p className="p-4 text-sm text-slate-500">No orders yet.</p> : (
              <table className="w-full text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase text-slate-500"><th className="px-4 py-2">Order</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{c.recentOrders.map((o) => <tr key={o.id}><td className="px-4 py-2"><Link className="font-medium text-indigo-700 hover:underline" href={`/admin/orders/${o.id}`}>{o.orderNumber}</Link></td><td className="px-4 py-2 text-slate-600">{fmtDate(o.createdAt)}</td><td className="px-4 py-2"><StatusBadge status={o.status} /></td><td className="px-4 py-2 text-right tabular-nums">{fmtMoney(o.grandTotal)}</td></tr>)}</tbody></table>
            )}
          </Card>
          <Card title="Saved addresses">
            {c.addresses.length === 0 ? <p className="text-sm text-slate-500">None saved.</p> : <ul className="grid gap-3 sm:grid-cols-2">{c.addresses.map((a) => <li key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm"><p className="font-medium">{a.fullName}</p><p className="text-slate-600">{a.line1}, {a.city}, {a.state} {a.postalCode}</p></li>)}</ul>}
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="Account"><DL items={[["Status", <StatusBadge key="s" status={c.status} />], ["Phone", c.phone ?? "—"], ["Email verified", c.emailVerifiedAt ? fmtDate(c.emailVerifiedAt, false) : "No"], ["Phone verified", c.phoneVerifiedAt ? fmtDate(c.phoneVerifiedAt, false) : "No"], ["Marketing consent", c.marketingOptIn ? "Opted in" : "No"], ["Registered", fmtDate(c.createdAt)], ["Last login", fmtDate(c.lastLoginAt)], ["Last login IP", c.lastLoginIp ?? "—"]]} /></Card>
          <Card title="Value"><DL items={[["Orders", c.ordersCount], ["Lifetime value", fmtMoney(c.lifetimeValue)], ["Average order", fmtMoney(c.averageOrderValue)], ["Reviews", c.counts.reviews], ["Returns", c.counts.returns], ["Support tickets", c.counts.tickets]]} /></Card>
        </div>
      </div>
      <ConfirmDialog open={!!target} onClose={() => setTarget(null)} busy={m.isPending} danger={target !== "ACTIVE"} title={target === "ACTIVE" ? "Reactivate account?" : target === "SUSPENDED" ? "Suspend account?" : "Ban account?"}
        confirmLabel={target === "ACTIVE" ? "Reactivate" : target === "SUSPENDED" ? "Suspend" : "Ban"} reasonLabel="Reason (audited)" onConfirm={(r) => m.mutate(r)}
        impact={target === "ACTIVE" ? "The customer can sign in again." : "All of the customer’s sessions are revoked immediately and they cannot sign in or check out."} />
    </>
  );
}
