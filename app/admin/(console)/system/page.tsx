"use client";

import { CheckCircle2, CircleAlert, FlaskConical } from "lucide-react";
import { useDataQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { Badge, Btn, Card, ErrorState, PageHeader, Skeleton, StatCard } from "@/components/admin/ui";
import { fmtDate } from "@/lib/admin/format";

interface Health {
  time: string; environment: string; database: { status: string; latencyMs: number };
  integrations: { key: string; label: string; state: "configured" | "not_configured" | "development_only"; note?: string }[];
  signals: { failedWebhooks24h: number; failedDeliveries24h: number; queuedDeliveries: number; stuckPayments: number; failedRefunds: number; pendingRefunds: number };
}

export default function SystemPage() {
  return (
    <RequirePermission anyOf={["settings:manage"]}>
      <System />
    </RequirePermission>
  );
}

function System() {
  const q = useDataQuery<Health>(["system"], "/admin/system");
  const h = q.data;
  return (
    <>
      <PageHeader title="System health & integrations" description="Whether each integration has the configuration it needs. Secrets are never displayed. “Configured” means credentials are present — it does not prove a live round-trip." actions={<Btn onClick={() => q.refetch()} loading={q.isFetching}>Refresh</Btn>} />
      {q.error ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : !h ? <Skeleton className="h-72 w-full" /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Environment" value={h.environment} hint={`Checked ${fmtDate(h.time)}`} />
            <StatCard label="Database" value={h.database.status === "up" ? "Up" : "DOWN"} tone={h.database.status === "up" ? "neutral" : "danger"} hint={`${h.database.latencyMs} ms`} />
            <StatCard label="Failed webhooks · 24h" value={h.signals.failedWebhooks24h} tone={h.signals.failedWebhooks24h ? "danger" : "neutral"} href="/admin/payments?tab=webhooks&wstatus=FAILED" />
            <StatCard label="Stuck payments (>30 min)" value={h.signals.stuckPayments} tone={h.signals.stuckPayments ? "warning" : "neutral"} href="/admin/payments?status=CREATED" />
            <StatCard label="Failed refunds" value={h.signals.failedRefunds} tone={h.signals.failedRefunds ? "danger" : "neutral"} href="/admin/refunds?status=FAILED" />
            <StatCard label="Refunds awaiting payout" value={h.signals.pendingRefunds} href="/admin/refunds?status=PENDING" />
            <StatCard label="Failed notifications · 24h" value={h.signals.failedDeliveries24h} tone={h.signals.failedDeliveries24h ? "danger" : "neutral"} href="/admin/notifications?status=FAILED" />
            <StatCard label="Queued notifications" value={h.signals.queuedDeliveries} href="/admin/notifications?status=QUEUED" />
          </div>
          <Card title="Integrations" pad={false}>
            <ul className="divide-y divide-slate-100">
              {h.integrations.map((i) => (
                <li key={i.key} className="flex items-start gap-3 px-4 py-3">
                  {i.state === "configured" ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-500" /> : i.state === "development_only" ? <FlaskConical className="mt-0.5 size-5 text-amber-500" /> : <CircleAlert className="mt-0.5 size-5 text-rose-500" />}
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{i.label}</p>{i.note && <p className="text-xs text-slate-500">{i.note}</p>}</div>
                  <Badge tone={i.state === "configured" ? "success" : i.state === "development_only" ? "warning" : "danger"}>{i.state === "configured" ? "Credentials present" : i.state === "development_only" ? "Development only" : "Not configured"}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
