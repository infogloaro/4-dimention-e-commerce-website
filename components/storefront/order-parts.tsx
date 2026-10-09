"use client";

import { AlertTriangle, Check, Circle, Info, Loader2, Truck, X } from "lucide-react";
import { ProductImage } from "./product-image";
import { formatDate, money } from "@/lib/shop/format";
import { statusLabel, statusTone, type StatusKind, type StatusTone } from "@/lib/order-status";
import type { Order, ProgressStage, TrackingEvent } from "@/lib/shop/types";

const PILL: Record<StatusTone, string> = {
  neutral: "bg-black/5 text-[#46473f]", info: "bg-sky-50 text-sky-800", success: "bg-[#eff3e3] text-[#3f5220]",
  warning: "bg-amber-50 text-amber-900", danger: "bg-red-50 text-red-800", accent: "bg-[#eef0e0] text-[#4d5832]",
};

/** One badge component for every state machine, so customer labels always come from lib/order-status.ts. */
export function StatusPill({ status, kind }: { status: string; kind: StatusKind }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${PILL[statusTone(status, kind) ?? "neutral"]}`}>{statusLabel(status, kind)}</span>;
}

export function OrderItems({ items }: { items: Order["items"] }) {
  return (
    <ul className="divide-y divide-black/10">
      {items.map((i) => (
        <li key={i.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-[#f0efe9] sm:h-20 sm:w-20"><ProductImage src={i.imageUrl} alt={i.name} boxClassName="h-full w-full" className="p-1" width={80} height={80} /></div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium">{i.name}</p>
            {i.variantName && <p className="text-xs text-[#77786f]">{i.variantName}</p>}
            <p className="mt-0.5 text-xs text-[#77786f]">Qty {i.quantity}{i.cancelledQuantity > 0 && ` · ${i.cancelledQuantity} cancelled`}{i.returnedQuantity > 0 && ` · ${i.returnedQuantity} returned`}</p>
          </div>
          <p className="shrink-0 text-sm font-semibold">{money(i.lineTotal)}</p>
        </li>
      ))}
    </ul>
  );
}

export function OrderTotals({ order }: { order: Pick<Order, "totals" | "currency"> }) {
  const t = order.totals;
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between"><dt className="text-[#717168]">Subtotal</dt><dd>{money(t.subtotal, order.currency)}</dd></div>
      {t.discount > 0 && <div className="flex justify-between text-[#53652e]"><dt>Discounts</dt><dd>−{money(t.discount, order.currency)}</dd></div>}
      <div className="flex justify-between"><dt className="text-[#717168]">Delivery</dt><dd>{t.shipping === 0 ? "Free" : money(t.shipping, order.currency)}</dd></div>
      <div className="flex justify-between"><dt className="text-[#717168]">{t.pricesIncludeTax ? "Tax (included)" : "Tax"}</dt><dd>{money(t.tax, order.currency)}</dd></div>
      <div className="flex justify-between border-t border-black/10 pt-3 text-base font-semibold"><dt>Total</dt><dd>{money(t.grandTotal, order.currency)}</dd></div>
      {t.refunded > 0 && <div className="flex justify-between text-[#53652e]"><dt>Refunded</dt><dd>{money(t.refunded, order.currency)}</dd></div>}
    </dl>
  );
}

/** Customer progress stepper. Stages and their state come from the server (derived from recorded history, never from time). */
export function ProgressStepper({ stages, cancelled }: { stages: ProgressStage[]; cancelled: boolean }) {
  return (
    <ol className="grid gap-0 sm:grid-flow-col sm:auto-cols-fr" aria-label="Order progress">
      {stages.map((s, i) => {
        const done = s.state === "completed", current = s.state === "current", skipped = s.state === "skipped";
        return (
          <li key={s.status} aria-current={current ? "step" : undefined} className="relative flex gap-3 pb-5 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center">
            {i > 0 && <span aria-hidden className={`absolute left-[11px] top-[-14px] h-[calc(100%-4px)] w-px sm:left-[-50%] sm:top-[11px] sm:h-px sm:w-full ${done || current ? "bg-[#758446]" : "bg-black/15"}`} />}
            <span className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full ${done ? "bg-[#758446] text-white" : current ? (cancelled ? "bg-red-600 text-white" : "bg-[#22231f] text-white ring-4 ring-[#d6ed79]/60") : skipped ? "bg-black/10 text-[#92938b]" : "border border-black/20 bg-white text-transparent"}`}>
              {done ? <Check size={13} /> : skipped ? <X size={12} /> : current ? <Circle size={8} fill="currentColor" /> : <Circle size={8} />}
            </span>
            <span><span className={`block text-sm ${current ? "font-semibold" : done ? "font-medium" : "text-[#77786f]"}`}>{s.label}</span>{s.at && <span className="block text-[11px] text-[#77786f]">{formatDate(s.at, true)}</span>}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Persisted events only. Events tied to a shipment are carrier/dispatch events; the rest are our own processing events. */
export function EventTimeline({ events }: { events: TrackingEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-[#77786f]">No tracking events have been recorded yet.</p>;
  return (
    <ol className="space-y-5">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3">
          <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${e.shipmentId ? "bg-[#eef0e0] text-[#4d5832]" : "bg-black/5 text-[#62635b]"}`}>{e.shipmentId ? <Truck size={14} aria-hidden /> : <Check size={14} aria-hidden />}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{e.title} <span className="ml-1 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-normal tracking-wide text-[#62635b]">{e.shipmentId ? "CARRIER / SHIPMENT" : "OUR UPDATE"}</span></p>
            {e.description && <p className="text-sm text-[#65665e]">{e.description}</p>}
            <p className="text-xs text-[#77786f]">{formatDate(e.occurredAt, true)}{e.location ? ` · ${e.location}` : ""}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Banner({ tone, title, children }: { tone: "success" | "warning" | "danger" | "info"; title: string; children?: React.ReactNode }) {
  const cls = { success: "border-[#80934b]/40 bg-[#eff3e3]", warning: "border-amber-300 bg-amber-50", danger: "border-red-300 bg-red-50", info: "border-sky-200 bg-sky-50" }[tone];
  const icon = tone === "success" ? <Check size={22} className="text-[#53652e]" aria-hidden /> : tone === "warning" ? <Loader2 size={22} className="animate-spin text-amber-700 motion-reduce:animate-none" aria-hidden /> : tone === "danger" ? <AlertTriangle size={22} className="text-red-700" aria-hidden /> : <Info size={22} className="text-sky-700" aria-hidden />;
  return (
    <section role={tone === "danger" ? "alert" : "status"} className={`flex items-start gap-4 rounded-xl border p-5 ${cls}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div><h1 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h1><div className="mt-1 text-sm leading-6 text-[#46473f]">{children}</div></div>
    </section>
  );
}
