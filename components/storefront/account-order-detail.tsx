"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Banner, EventTimeline, OrderItems, OrderTotals, ProgressStepper, StatusPill } from "./order-parts";
import { useRequireCustomer } from "./account-orders";
import { api, ApiError, errorMessage } from "@/lib/shop/api";
import { useApi } from "@/lib/shop/hooks";
import { formatDate, formatDateRange, money } from "@/lib/shop/format";
import { orderHeadline } from "@/lib/order-status";
import type { Order } from "@/lib/shop/types";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-black/45" />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-semibold">{title}</h2>{children}</div>
    </div>
  );
}

function CancelDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const paid = order.paymentStatus === "PAID";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.post(`/orders/${order.id}/cancel`, { reason: reason.trim() || "Changed my mind" }); onDone(); }
    catch (x) { setErr(errorMessage(x)); setBusy(false); }
  };
  return (
    <Modal title="Cancel this order?" onClose={onClose}>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <p className="text-sm text-[#62635b]">{paid ? "Your payment will be refunded to the original payment method." : "Nothing has been charged, so there's nothing to refund."} This can&apos;t be undone.</p>
        <label className="block text-sm font-medium">Reason (optional)<textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} rows={3} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#758446]" /></label>
        {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-black/20 px-5 py-2.5 text-sm font-semibold">Keep order</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-red-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy && <Loader2 size={14} className="animate-spin" />} Cancel order</button></div>
      </form>
    </Modal>
  );
}

function ReturnDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const items = order.items.filter((i) => i.returnableQuantity > 0);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState<"REFUND" | "REPLACEMENT">("REFUND");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const chosen = items.filter((i) => (qty[i.id] ?? 0) > 0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chosen.length === 0) { setErr("Choose at least one item to return."); return; }
    setBusy(true); setErr(null);
    try { await api.post(`/orders/${order.id}/returns`, { items: chosen.map((i) => ({ orderItemId: i.id, quantity: qty[i.id]! })), reason: reason.trim(), resolution }); onDone(); }
    catch (x) { setErr(errorMessage(x)); setBusy(false); }
  };
  return (
    <Modal title="Request a return" onClose={onClose}>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <ul className="space-y-3">{items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 flex-1 truncate">{i.name}</span>
            <select aria-label={`Quantity of ${i.name} to return`} value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })} className="rounded-lg border border-black/15 px-2 py-1.5">{Array.from({ length: i.returnableQuantity + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? "Not returning" : n}</option>)}</select></li>
        ))}</ul>
        <label className="block text-sm font-medium">Why are you returning it?<input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#758446]" /></label>
        <fieldset className="text-sm"><legend className="font-medium">What would you like?</legend><div className="mt-1 flex gap-4"><label><input type="radio" checked={resolution === "REFUND"} onChange={() => setResolution("REFUND")} className="mr-1.5 accent-[#758446]" />Refund</label><label><input type="radio" checked={resolution === "REPLACEMENT"} onChange={() => setResolution("REPLACEMENT")} className="mr-1.5 accent-[#758446]" />Replacement</label></div></fieldset>
        <p className="text-xs text-[#77786f]">Returns are reviewed by our team. Refunds cover item value and are issued once we receive the items.</p>
        {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-black/20 px-5 py-2.5 text-sm font-semibold">Close</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-[#22231f] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy && <Loader2 size={14} className="animate-spin" />} Submit request</button></div>
      </form>
    </Modal>
  );
}

export function AccountOrderDetail({ id }: { id: string }) {
  const { user, authReady, notify } = useRequireCustomer(`/account/orders/${id}`);
  const { data: order, error, loading, reload } = useApi<Order>(user ? `/orders/${encodeURIComponent(id)}` : null, undefined, { pollMs: 30_000 });
  const [dialog, setDialog] = useState<"cancel" | "return" | null>(null);

  if (!authReady || (loading && !order)) return <div className="mx-auto max-w-5xl px-5 py-14"><div className="h-80 animate-pulse rounded-xl bg-[#ebeae2]" aria-label="Loading order" /></div>;
  if (error && !order) {
    const gone = error instanceof ApiError && (error.status === 404 || error.status === 403);
    return <div className="mx-auto max-w-5xl px-5 py-14"><Banner tone="danger" title={gone ? "Order not found" : "We couldn't load this order"}>{gone ? "There's no order with that number on your account." : errorMessage(error)}<div className="mt-3 flex gap-4">{!gone && <button className="underline" onClick={reload}>Retry</button>}<Link className="underline" href="/account/orders">All orders</Link></div></Banner></div>;
  }
  if (!order) return null;

  const shipments = order.tracking.shipments;
  const h = orderHeadline({ status: order.status, paymentStatus: order.paymentStatus, shipments });
  const cancelledLike = ["CANCELLED", "FAILED"].includes(order.status);
  const showStepper = !["PENDING_PAYMENT", "FAILED"].includes(order.status);
  const eta = formatDateRange(order.tracking.estimatedDelivery.min, order.tracking.estimatedDelivery.max);
  const a = order.shippingAddress;
  const done = () => { setDialog(null); notify("Done — order updated"); reload(); };

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <Link href="/account/orders" className="text-sm text-[#62635b] hover:text-black">← All orders</Link>
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="font-mono text-3xl font-semibold tracking-tight">{order.orderNumber}</h1><p className="mt-1 text-sm text-[#717168]">Placed {formatDate(order.placedAt ?? order.createdAt, true)}</p></div>
        <div className="flex flex-wrap gap-2"><StatusPill status={order.status} kind="order" /><StatusPill status={order.paymentStatus} kind="payment" /></div>
      </header>

      <div className="mt-6"><Banner tone={h.tone === "success" ? "success" : h.tone === "danger" ? "danger" : h.tone === "warning" ? "warning" : "info"} title={h.title}>{h.detail}{eta && !cancelledLike && order.status !== "DELIVERED" && order.status !== "RETURNED" ? ` Estimated delivery: ${eta}.` : ""}{order.cancelReason && order.status === "CANCELLED" ? ` Reason: ${order.cancelReason}` : ""}</Banner></div>

      {showStepper && (
        <section id="tracking" className="mt-8 scroll-mt-28 rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="track-h">
          <h2 id="track-h" className="mb-5 text-lg font-semibold">Order progress</h2>
          <ProgressStepper stages={order.tracking.progress} cancelled={cancelledLike} />
        </section>
      )}

      {shipments.length > 0 && (
        <section className="mt-6 rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="ship-h">
          <h2 id="ship-h" className="mb-3 text-lg font-semibold">Shipments</h2>
          <ul className="space-y-4">{shipments.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div><p className="font-medium">{s.carrier ?? "Carrier not yet recorded"}</p>{s.trackingNumber ? <p className="font-mono text-xs text-[#62635b]">Tracking no. {s.trackingNumber}</p> : <p className="text-xs text-[#77786f]">Tracking number will appear once the carrier collects the parcel.</p>}{s.estimatedDelivery && !s.deliveredAt && <p className="text-xs text-[#77786f]">Estimated {formatDate(s.estimatedDelivery)}</p>}{s.deliveredAt && <p className="text-xs text-[#77786f]">Delivered {formatDate(s.deliveredAt, true)}</p>}</div>
              <div className="flex items-center gap-3"><StatusPill status={s.status} kind="shipment" />{s.trackingUrl && /^https?:\/\//.test(s.trackingUrl) && <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline">Carrier site <ExternalLink size={12} aria-hidden /></a>}</div>
            </li>))}</ul>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="items-h"><h2 id="items-h" className="mb-4 text-lg font-semibold">Items</h2><OrderItems items={order.items} /></section>
          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="hist-h"><h2 id="hist-h" className="mb-4 text-lg font-semibold">Tracking history</h2><EventTimeline events={order.tracking.events} /></section>
        </div>
        <aside className="space-y-6">
          <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-6"><h2 className="mb-3 text-lg font-semibold">Payment summary</h2><OrderTotals order={order} />
            {order.payments.length > 0 && <p className="mt-3 text-xs text-[#77786f]">Paid via {order.payments[0]!.provider === "COD" ? "cash on delivery" : order.payments[0]!.method.replace(/_/g, " ")}{order.payments[0]!.paidAt ? ` on ${formatDate(order.payments[0]!.paidAt)}` : ""}.</p>}
            {order.refunds.length > 0 && <ul className="mt-3 space-y-1 border-t border-black/10 pt-3 text-xs">{order.refunds.map((r) => <li key={r.id} className="flex items-center justify-between"><span>Refund {money(r.amount, order.currency)}</span><StatusPill status={r.status} kind="refund" /></li>)}</ul>}
          </section>
          {a && <section className="rounded-xl border border-black/10 bg-white p-5 text-sm shadow-sm sm:p-6"><h2 className="mb-2 text-lg font-semibold">Shipping address</h2><p className="font-medium">{a.fullName}</p><p className="leading-6 text-[#62635b]">{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.state} {a.postalCode}<br />{a.phone}</p>{order.shipping?.details?.name && <p className="mt-2 text-xs text-[#77786f]">{order.shipping.details.name}</p>}</section>}
          {order.returns.length > 0 && <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-6"><h2 className="mb-3 text-lg font-semibold">Returns</h2><ul className="space-y-2 text-sm">{order.returns.map((r) => <li key={r.id} className="flex items-center justify-between"><span className="font-mono text-xs">{r.number}</span><StatusPill status={r.status} kind="return" /></li>)}</ul></section>}
          {(order.actions.canCancel || order.actions.canReturn) && (
            <section className="space-y-3 rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-semibold">Need to change something?</h2>
              {order.actions.canCancel && <button type="button" onClick={() => setDialog("cancel")} className="w-full rounded-full border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-50">Cancel order</button>}
              {order.actions.canReturn && <><button type="button" onClick={() => setDialog("return")} className="w-full rounded-full border border-black/25 px-5 py-2.5 text-sm font-semibold hover:border-black/60">Request a return</button>{order.actions.returnWindowEndsAt && <p className="text-xs text-[#77786f]">Return window closes {formatDate(order.actions.returnWindowEndsAt)}.</p>}</>}
            </section>
          )}
        </aside>
      </div>
      {dialog === "cancel" && <CancelDialog order={order} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "return" && <ReturnDialog order={order} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}
