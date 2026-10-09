"use client";

import { Thumb } from "@/components/admin/thumb";
import { Check, Circle, CreditCard, PackageCheck, Printer, Truck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth, RequirePermission } from "@/components/admin/providers";
import { useAdminMutation, useDataQuery } from "@/components/admin/data";
import { Btn, Card, ConfirmDialog, DL, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, StatusBadge, Textarea, cx } from "@/components/admin/ui";
import { statusLabel } from "@/lib/order-status";
import { api, newIdempotencyKey } from "@/lib/admin/api";
import { fmtDate, fmtMoney, rupeesToMinor, titleCase } from "@/lib/admin/format";

interface Item { id: string; sku: string; name: string; variantName: string | null; brand: string | null; imageUrl: string | null; attributes: Record<string, string>; quantity: number; unitPrice: number; discountAmount: number; taxRatePercent: number; taxAmount: number; lineTotal: number; cancelledQuantity: number; returnedQuantity: number; returnableQuantity: number }
interface Address { fullName: string; line1: string; line2?: string | null; landmark?: string | null; city: string; state: string; postalCode: string; country: string; phone: string }
interface Shipment { id: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; status: string; shippedAt: string | null; estimatedDelivery: string | null; deliveredAt: string | null; items: { orderItemId: string; quantity: number }[] }
interface OrderDetail {
  id: string; orderNumber: string; invoiceNumber: string | null; status: string; statusLabel: string; paymentStatus: string; currency: string; placedAt: string | null; createdAt: string;
  totals: { subtotal: number; discount: number; shipping: number; tax: number; grandTotal: number; refunded: number; pricesIncludeTax: boolean };
  items: Item[]; shippingAddress: Address | null; billingAddress: Address | null;
  shipping: { method: string; details?: { name?: string; carrier?: string } } | null;
  coupon: { code?: string }[] | { code?: string } | null;
  customer: { name: string; email: string; phone: string | null };
  notes: string | null; cancelReason: string | null;
  payments: { id: string; provider: string; method: string; status: string; amount: number; paidAt: string | null; failureReason: string | null; createdAt: string }[];
  refunds: { id: string; amount: number; status: string; reason?: string; createdAt?: string; providerRefundId?: string | null; failureReason?: string | null }[];
  returns: { id: string; status: string; reason?: string; createdAt?: string }[];
  timestamps: Record<string, string | null>;
  tracking: { progress: { status: string; label: string; state: string; at: string | null }[]; events: { id: string; code: string; title: string; description: string | null; location: string | null; occurredAt: string; shipmentId: string | null }[]; shipments: Shipment[] };
  allowedTransitions: string[];
  history: { id: string; fromStatus: string | null; toStatus: string; note: string | null; actorId: string | null; createdAt: string }[];
}

const TRANSITION_IMPACT: Record<string, string> = {
  CONFIRMED: "The order is confirmed and customers are notified through the configured channels.",
  PROCESSING: "Fulfilment begins. Stock stays reserved for this order.",
  PACKED: "Items are marked packed and are no longer cancellable by the customer.",
  SHIPPED: "Use “Create shipment” to record the carrier and tracking number instead; moving here without one creates a shipment without carrier details.",
  OUT_FOR_DELIVERY: "The customer is notified that delivery is imminent.",
  DELIVERED: "Marks the order delivered, starts the return window and (for COD) records the cash payment as captured. Only do this with proof of delivery.",
  CANCELLED: "The order is cancelled. The server releases reserved stock / restocks and refunds any captured payment according to its cancellation rules, and notifies the customer.",
};

export default function OrderPage() {
  return (
    <RequirePermission anyOf={["order:read"]}>
      <OrderWorkspace />
    </RequirePermission>
  );
}

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
function printPackingSlip(o: OrderDetail) {
  const a = o.shippingAddress;
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  w.document.write(`<!doctype html><title>Packing slip ${esc(o.orderNumber)}</title><style>body{font:14px system-ui;margin:32px;color:#111}table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}h1{font-size:20px}</style>
  <h1>Packing slip · ${esc(o.orderNumber)}</h1><p>Placed ${esc(fmtDate(o.placedAt ?? o.createdAt))}</p>
  <h3>Ship to</h3><p>${a ? `${esc(a.fullName)}<br>${esc(a.line1)}${a.line2 ? "<br>" + esc(a.line2) : ""}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.postalCode)}<br>Phone: ${esc(a.phone)}` : "—"}</p>
  <table><tr><th>SKU</th><th>Item</th><th>Qty</th></tr>${o.items.map((i) => `<tr><td>${esc(i.sku)}</td><td>${esc(i.name)}${i.variantName ? " — " + esc(i.variantName) : ""}</td><td>${i.quantity - i.cancelledQuantity}</td></tr>`).join("")}</table>
  <script>onload=()=>print()</script>`);
  w.document.close();
}

type Dlg = null | { kind: "transition"; to: string } | { kind: "ship" } | { kind: "refund" } | { kind: "event" } | { kind: "shipment-status"; shipment: Shipment };

function OrderWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const q = useDataQuery<OrderDetail>(["order", id], `/admin/orders/${id}`);
  const [dlg, setDlg] = useState<Dlg>(null);
  const o = q.data;

  if (q.error) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  if (!o) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /><Skeleton className="h-48 w-full" /></div>;

  const refundable = o.totals.grandTotal - o.totals.refunded;
  const canRefund = can("order:refund") && (o.paymentStatus === "PAID" || o.paymentStatus === "PARTIALLY_REFUNDED") && refundable > 0;
  const canUpdate = can("order:update");
  const canShip = (canUpdate || can("shipping:manage")) && o.status === "PACKED";
  const transitions = o.allowedTransitions.filter((t) => t !== "CANCELLED" || can("order:cancel")).filter((t) => canUpdate && t !== "RETURN_REQUESTED" && t !== "RETURNED" && t !== "PLACED" && t !== "FAILED");
  const couponCode = Array.isArray(o.coupon) ? o.coupon.map((c) => c.code).filter(Boolean).join(", ") : o.coupon?.code;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Orders", href: "/admin/orders" }, { label: o.orderNumber }]}
        title={`Order ${o.orderNumber}`}
        description={`Placed ${fmtDate(o.placedAt ?? o.createdAt)} IST · ${o.customer.name}`}
        actions={<>
          <StatusBadge status={o.status} kind="order" /><StatusBadge status={o.paymentStatus} kind="payment" />
          <Btn onClick={() => printPackingSlip(o)}><Printer className="size-4" /> Packing slip</Btn>
        </>}
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* progress */}
          <Card title="Fulfilment progress">
            <ol className="flex flex-wrap gap-y-3">
              {o.tracking.progress.map((p, i) => (
                <li key={p.status} className="flex min-w-[96px] flex-1 flex-col items-center text-center">
                  <span className={cx("grid size-7 place-items-center rounded-full border-2", p.state === "completed" ? "border-emerald-500 bg-emerald-500 text-white" : p.state === "current" ? "border-indigo-600 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-300")}>
                    {p.state === "completed" ? <Check className="size-4" /> : <Circle className="size-2.5 fill-current" />}
                  </span>
                  <span className={cx("mt-1 text-xs", p.state === "upcoming" ? "text-slate-400" : "font-medium text-slate-700")}>{p.label}</span>
                  {p.at && <span className="text-[10px] text-slate-400">{fmtDate(p.at)}</span>}
                  <span className="sr-only">{p.state}{i}</span>
                </li>
              ))}
            </ol>
            {(o.status === "CANCELLED" || o.status === "FAILED") && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{o.status === "CANCELLED" ? `Cancelled${o.cancelReason ? `: ${o.cancelReason}` : ""}` : "Payment failed — the order was not placed."}</p>}
          </Card>

          {/* actions */}
          {(transitions.length > 0 || canShip || canRefund || canUpdate) && (
            <Card title="Actions">
              <div className="flex flex-wrap gap-2">
                {canShip && <Btn variant="primary" onClick={() => setDlg({ kind: "ship" })}><Truck className="size-4" /> Create shipment</Btn>}
                {transitions.filter((t) => !(canShip && t === "SHIPPED")).map((t) => (
                  <Btn key={t} variant={t === "CANCELLED" ? "danger" : "secondary"} onClick={() => setDlg({ kind: "transition", to: t })}>
                    {t === "CANCELLED" ? "Cancel order" : t === "DELIVERED" ? <><PackageCheck className="size-4" /> Mark delivered</> : `Mark ${statusLabel(t, "order").toLowerCase()}`}
                  </Btn>
                ))}
                {canRefund && <Btn onClick={() => setDlg({ kind: "refund" })}><Undo2 className="size-4" /> Issue refund</Btn>}
                {canUpdate && <Btn variant="ghost" onClick={() => setDlg({ kind: "event" })}>Add tracking note</Btn>}
              </div>
              <p className="mt-3 text-xs text-slate-500">Only transitions the order state machine allows from “{titleCase(o.status)}” are offered. Payment status can’t be edited here — it changes only through verified payment, webhook or refund processing.</p>
            </Card>
          )}

          {/* items */}
          <Card title={`Items (${o.items.length})`} pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">Unit price</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Tax</th><th className="px-4 py-2 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {o.items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-4 py-3"><div className="flex items-center gap-3">
                        { }
                        <Thumb src={i.imageUrl} alt={i.name} className="size-11 rounded-lg border border-slate-200 object-cover" />
                        <div className="min-w-0"><p className="font-medium text-slate-900">{i.name}</p><p className="text-xs text-slate-500">{i.variantName} · <span className="font-mono">{i.sku}</span></p>
                          {(i.cancelledQuantity > 0 || i.returnedQuantity > 0) && <p className="text-xs text-amber-700">{i.cancelledQuantity > 0 && `${i.cancelledQuantity} cancelled `}{i.returnedQuantity > 0 && `${i.returnedQuantity} returned`}</p>}</div></div></td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(i.unitPrice, o.currency)}{i.discountAmount > 0 && <p className="text-xs text-emerald-600">−{fmtMoney(i.discountAmount, o.currency)}</p>}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{i.quantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{fmtMoney(i.taxAmount, o.currency)} <span className="text-xs">({i.taxRatePercent}%)</span></td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtMoney(i.lineTotal, o.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Prices are the immutable snapshot taken at purchase time, not the current catalogue price.</p>
          </Card>

          {/* shipments */}
          <Card title="Shipments">
            {o.tracking.shipments.length === 0 ? <p className="text-sm text-slate-500">No shipment has been created yet.</p> : (
              <ul className="space-y-3">
                {o.tracking.shipments.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div className="space-y-0.5 text-sm">
                      <div className="flex items-center gap-2"><StatusBadge status={s.status} kind="shipment" /><span className="font-medium">{s.carrier ?? "Carrier not recorded"}</span></div>
                      <p className="text-slate-600">Tracking: {s.trackingNumber ? (s.trackingUrl ? <a className="text-indigo-700 underline" href={s.trackingUrl} target="_blank" rel="noopener noreferrer">{s.trackingNumber}</a> : <span className="font-mono">{s.trackingNumber}</span>) : <span className="text-amber-700">missing</span>}</p>
                      <p className="text-xs text-slate-500">Shipped {fmtDate(s.shippedAt)} · ETA {s.estimatedDelivery ? fmtDate(s.estimatedDelivery, false) : "—"}{s.deliveredAt && ` · Delivered ${fmtDate(s.deliveredAt)}`}</p>
                    </div>
                    {(canUpdate || can("shipping:manage")) && s.status !== "DELIVERED" && s.status !== "RETURNED_TO_SENDER" && <Btn size="sm" onClick={() => setDlg({ kind: "shipment-status", shipment: s })}>Update status</Btn>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">No carrier API is integrated: statuses here are entered by staff (internal), not pulled from a carrier.</p>
          </Card>

          {/* timeline */}
          <Card title="Timeline">
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              {o.tracking.events.map((e) => (
                <li key={e.id}>
                  <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-indigo-500" />
                  <p className="text-sm font-medium text-slate-900">{e.title} {e.shipmentId && <span className="ml-1 rounded bg-slate-100 px-1.5 text-[10px] font-normal text-slate-600">shipment</span>}</p>
                  {e.description && <p className="text-sm text-slate-600">{e.description}</p>}
                  <p className="text-xs text-slate-400">{fmtDate(e.occurredAt)}{e.location && ` · ${e.location}`} · recorded by 4D Commerce</p>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Status history (internal audit trail)" pad={false}>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase text-slate-500"><th className="px-4 py-2">When</th><th className="px-4 py-2">Change</th><th className="px-4 py-2">Note</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {o.history.map((h) => <tr key={h.id}><td className="px-4 py-2 text-slate-500">{fmtDate(h.createdAt)}</td><td className="px-4 py-2">{h.fromStatus ? `${titleCase(h.fromStatus)} → ` : ""}<strong>{titleCase(h.toStatus)}</strong></td><td className="px-4 py-2 text-slate-600">{h.note ?? "—"}</td></tr>)}
              </tbody>
            </table>
          </Card>
        </div>

        {/* sidebar */}
        <div className="space-y-5">
          <Card title="Financial summary">
            <dl className="space-y-1.5 text-sm">
              {([["Subtotal", o.totals.subtotal], ["Discount", -o.totals.discount], ["Shipping", o.totals.shipping], [o.totals.pricesIncludeTax ? "Tax (included)" : "Tax", o.totals.tax]] as [string, number][]).map(([k, v]) => (
                <div key={k} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="tabular-nums">{fmtMoney(v, o.currency)}</dd></div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold"><dt>Grand total</dt><dd className="tabular-nums">{fmtMoney(o.totals.grandTotal, o.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Refunded</dt><dd className="tabular-nums">{fmtMoney(o.totals.refunded, o.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Refundable balance</dt><dd className="tabular-nums">{fmtMoney(o.paymentStatus === "PAID" || o.paymentStatus === "PARTIALLY_REFUNDED" ? refundable : 0, o.currency)}</dd></div>
            </dl>
            {couponCode && <p className="mt-3 text-xs text-slate-500">Coupon: <span className="font-mono">{couponCode}</span></p>}
          </Card>

          <Card title="Payments" actions={<CreditCard className="size-4 text-slate-400" />}>
            {o.payments.length === 0 ? <p className="text-sm text-slate-500">No payment attempts.</p> : (
              <ul className="space-y-2.5">
                {o.payments.map((p) => (
                  <li key={p.id} className="text-sm">
                    <div className="flex items-center justify-between"><span className="font-medium">{p.provider} · {p.method}</span><StatusBadge status={p.status} kind="attempt" /></div>
                    <p className="text-xs text-slate-500">{fmtMoney(p.amount, o.currency)} · {p.paidAt ? `paid ${fmtDate(p.paidAt)}` : `created ${fmtDate(p.createdAt)}`}</p>
                    {p.failureReason && <p className="text-xs text-rose-600">{p.failureReason}</p>}
                  </li>
                ))}
              </ul>
            )}
            {o.refunds.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-1.5 text-xs font-semibold uppercase text-slate-500">Refunds</p>
                <ul className="space-y-2">
                  {o.refunds.map((r) => <li key={r.id} className="flex items-start justify-between gap-2 text-sm"><div><p>{fmtMoney(r.amount, o.currency)}</p><p className="text-xs text-slate-500">{r.reason}</p>{r.failureReason && <p className="text-xs text-rose-600">{r.failureReason}</p>}</div><div className="flex flex-col items-end gap-1"><StatusBadge status={r.status} kind="refund" />{r.status === "PENDING" && can("order:refund") && <ProcessRefundButton id={r.id} />}</div></li>)}
                </ul>
              </div>
            )}
          </Card>

          <Card title="Customer">
            <DL items={[["Name", o.customer.name], ["Email", o.customer.email], ["Phone", o.customer.phone]]} />
          </Card>
          <Card title="Shipping address">{o.shippingAddress ? <AddressView a={o.shippingAddress} /> : <p className="text-sm text-slate-500">—</p>}
            {o.shipping && <p className="mt-2 text-xs text-slate-500">Method: {o.shipping.details?.name ?? o.shipping.method}</p>}</Card>
          <Card title="Billing address">{o.billingAddress ? <AddressView a={o.billingAddress} /> : <p className="text-sm text-slate-500">—</p>}</Card>
          {o.returns.length > 0 && (
            <Card title="Returns">
              <ul className="space-y-2 text-sm">{o.returns.map((r) => <li key={r.id} className="flex items-center justify-between"><Link href="/admin/returns" className="text-indigo-700 hover:underline">{r.reason ?? "Return"}</Link><StatusBadge status={r.status} kind="return" /></li>)}</ul>
            </Card>
          )}
          {o.notes && <Card title="Customer note"><p className="text-sm text-slate-700">{o.notes}</p></Card>}
        </div>
      </div>

      {dlg?.kind === "transition" && <TransitionDialog order={o} to={dlg.to} onClose={() => setDlg(null)} />}
      {dlg?.kind === "ship" && <ShipDialog order={o} onClose={() => setDlg(null)} />}
      {dlg?.kind === "refund" && <RefundDialog order={o} max={refundable} onClose={() => setDlg(null)} />}
      {dlg?.kind === "event" && <EventDialog order={o} onClose={() => setDlg(null)} />}
      {dlg?.kind === "shipment-status" && <ShipmentStatusDialog shipment={dlg.shipment} onClose={() => setDlg(null)} />}
    </>
  );
}

function AddressView({ a }: { a: Address }) {
  return (
    <address className="text-sm not-italic leading-relaxed text-slate-700">
      <strong>{a.fullName}</strong><br />{a.line1}{a.line2 && <>, {a.line2}</>}{a.landmark && <><br />Near {a.landmark}</>}<br />{a.city}, {a.state} {a.postalCode}<br />{a.country} · {a.phone}
    </address>
  );
}

function ProcessRefundButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const m = useAdminMutation(() => api.post(`/admin/refunds/${id}/process`), { success: "Refund marked as paid out", onSuccess: () => setOpen(false) });
  return (
    <>
      <Btn size="sm" onClick={() => setOpen(true)}>Mark paid out</Btn>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} busy={m.isPending} title="Confirm offline refund" confirmLabel="Yes, money was paid out" onConfirm={() => m.mutate()}
        description="Only confirm once the money has actually been returned to the customer (e.g. bank transfer for a COD order)." impact="The refund is marked completed and the order’s payment status is updated. This is audited and cannot be undone." />
    </>
  );
}

function TransitionDialog({ order, to, onClose }: { order: OrderDetail; to: string; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const m = useAdminMutation((reason: string) => api.post(`/admin/orders/${order.id}/status`, { status: to, note: note || undefined, location: location || undefined, reason: to === "CANCELLED" ? reason : undefined }), { success: `Order moved to ${titleCase(to)}`, onSuccess: onClose });
  const cancel = to === "CANCELLED";
  return (
    <ConfirmDialog
      open onClose={onClose} busy={m.isPending} danger={cancel}
      title={cancel ? `Cancel order ${order.orderNumber}?` : `Move ${order.orderNumber} to “${statusLabel(to, "order")}”?`}
      confirmLabel={cancel ? "Cancel order" : "Confirm"}
      reasonLabel={cancel ? "Cancellation reason (shown in audit log)" : undefined}
      onConfirm={(r) => m.mutate(r)}
      description={<div className="space-y-3"><p>{order.items.length} item(s) · {fmtMoney(order.totals.grandTotal, order.currency)} · currently <strong>{titleCase(order.status)}</strong>.</p>
        {!cancel && <><Field label={to === "DELIVERED" ? "Proof of delivery (required unless the carrier reported delivery)" : to === "SHIPPED" ? "Manual fulfilment note (required — or use Create shipment)" : "Internal note (optional)"}>{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />}</Field>
          {(to === "SHIPPED" || to === "OUT_FOR_DELIVERY" || to === "DELIVERED") && <Field label="Location (optional)">{(id) => <Input id={id} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />}</Field>}</>}</div>}
      impact={TRANSITION_IMPACT[to]}
    />
  );
}

function ShipDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTn] = useState("");
  const [trackingUrl, setUrl] = useState("");
  const [eta, setEta] = useState("");
  const m = useAdminMutation(() => api.post(`/admin/orders/${order.id}/shipments`, { carrier: carrier || undefined, trackingNumber: trackingNumber || undefined, trackingUrl: trackingUrl || undefined, estimatedDelivery: eta ? new Date(eta).toISOString() : undefined }), { success: "Shipment created and order marked shipped", onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title="Create shipment" footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Create & mark shipped</Btn></>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">All remaining items of {order.orderNumber} ship together. The order moves to Shipped and the customer is notified.</p>
        <Field label="Carrier">{(id) => <Input id={id} value={carrier} onChange={(e) => setCarrier(e.target.value)} maxLength={80} placeholder="e.g. Delhivery" />}</Field>
        <Field label="Tracking number" hint="Leave blank only if the carrier has not issued one yet — the shipment will show as missing tracking.">{(id) => <Input id={id} value={trackingNumber} onChange={(e) => setTn(e.target.value)} maxLength={80} />}</Field>
        <Field label="Tracking URL">{(id) => <Input id={id} type="url" value={trackingUrl} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />}</Field>
        <Field label="Estimated delivery (from carrier)">{(id) => <Input id={id} type="date" value={eta} onChange={(e) => setEta(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

const SHIPMENT_STATES = ["LABEL_CREATED", "PICKED_UP", "IN_TRANSIT", "REACHED_HUB", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED_DELIVERY", "RETURNED_TO_SENDER"];
function ShipmentStatusDialog({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const [status, setStatus] = useState(SHIPMENT_STATES.includes(shipment.status) ? shipment.status : "IN_TRANSIT");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [tn, setTn] = useState(shipment.trackingNumber ?? "");
  const m = useAdminMutation(() => api.patch(`/admin/shipments/${shipment.id}`, { status, location: location || undefined, description: description || undefined, trackingNumber: tn || undefined }), { success: "Shipment updated", onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title="Update shipment status" footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Save</Btn></>}>
      <div className="space-y-3">
        <Field label="New status">{(id) => <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>{SHIPMENT_STATES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>}</Field>
        {status === "DELIVERED" && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">Marking delivered also marks the order delivered. Only do this with carrier proof of delivery. This manual override is audited.</p>}
        <Field label="Tracking number">{(id) => <Input id={id} value={tn} onChange={(e) => setTn(e.target.value)} maxLength={80} />}</Field>
        <Field label="Location">{(id) => <Input id={id} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />}</Field>
        <Field label="Note (visible on the customer timeline)">{(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />}</Field>
      </div>
    </Modal>
  );
}

function RefundDialog({ order, max, onClose }: { order: OrderDetail; max: number; onClose: () => void }) {
  const key = useMemo(() => newIdempotencyKey(), []); // one key per dialog open → a double-click can never refund twice
  const [amount, setAmount] = useState(String(max / 100));
  const [reason, setReason] = useState("");
  const minor = rupeesToMinor(amount);
  const err = minor === null || minor < 1 ? "Enter a valid amount" : minor > max ? `Cannot exceed the refundable balance (${fmtMoney(max, order.currency)})` : reason.trim().length < 3 ? "A reason is required" : "";
  const m = useAdminMutation(() => api.post(`/admin/orders/${order.id}/refunds`, { amount: minor, reason: reason.trim() }, { idempotencyKey: key }), { success: "Refund recorded", onSuccess: onClose });
  const cod = order.payments.some((p) => p.provider === "COD");
  return (
    <Modal open onClose={onClose} title={`Refund ${order.orderNumber}`} footer={<><Btn onClick={onClose} disabled={m.isPending}>Cancel</Btn><Btn variant="danger" disabled={!!err} loading={m.isPending} onClick={() => m.mutate()}>Issue refund</Btn></>}>
      <div className="space-y-3">
        <Field label="Amount (₹)" error={err && amount ? err : undefined} hint={`Refundable balance ${fmtMoney(max, order.currency)}`}>{(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label="Reason" required>{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}</Field>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">{cod ? "This is a COD order: the refund is recorded as PENDING and must be marked paid out after you return the money manually." : "The refund is sent to the payment provider. It is shown as completed only after the provider confirms."} The action is audited and cannot be undone.</p>
      </div>
    </Modal>
  );
}

function EventDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const m = useAdminMutation(() => api.post(`/admin/orders/${order.id}/tracking`, { title: title.trim(), description: description || undefined, location: location || undefined }), { success: "Tracking note added (visible to the customer)", onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title="Add tracking note" footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={title.trim().length < 2} loading={m.isPending} onClick={() => m.mutate()}>Add note</Btn></>}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">Notes appear on the customer’s tracking timeline. Use for exceptions such as “Address clarification requested”.</p>
        <Field label="Title" required>{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />}</Field>
        <Field label="Details">{(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />}</Field>
        <Field label="Location">{(id) => <Input id={id} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />}</Field>
      </div>
    </Modal>
  );
}
