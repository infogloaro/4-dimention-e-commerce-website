"use client";

import { Download, PackagePlus } from "lucide-react";
import { useState } from "react";
import { exportCsv, useAdminMutation, usePagedQuery } from "@/components/admin/data";
import { RequirePermission, useAuth } from "@/components/admin/providers";
import { Badge, Btn, Card, DataTable, Field, FilterBar, Input, Modal, PageHeader, Pagination, SearchBox, Select, Textarea, Toggle, useToast, useUrlState } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";
import { fmtMoney } from "@/lib/admin/format";

interface StockRow { variantId: string; sku: string; variantName: string | null; productId: string; productName: string; quantity: number; reserved: number; sold: number; threshold: number; allowBackorder: boolean; price: number; status: string; available: number; isLow: boolean }

export default function InventoryPage() {
  return (
    <RequirePermission anyOf={["inventory:read"]}>
      <Inventory />
    </RequirePermission>
  );
}

function Inventory() {
  const { can } = useAuth();
  const toast = useToast();
  const canWrite = can("inventory:write");
  const [f, set] = useUrlState({ search: "", lowStockOnly: "", page: "1" });
  const q = usePagedQuery<StockRow>("inventory", "/admin/inventory", { search: f.search, lowStockOnly: f.lowStockOnly || undefined, page: Number(f.page), pageSize: 25 });
  const [adjust, setAdjust] = useState<StockRow | null>(null);
  const [policy, setPolicy] = useState<StockRow | null>(null);
  const [receive, setReceive] = useState(false);

  async function doExport() {
    try {
      const n = await exportCsv<StockRow>("/admin/inventory", { search: f.search, lowStockOnly: f.lowStockOnly || undefined }, [
        { key: "sku", label: "SKU" }, { key: "productName", label: "Product" }, { key: "variantName", label: "Variant" }, { key: "quantity", label: "On hand" },
        { key: "reserved", label: "Reserved" }, { key: "available", label: "Sellable" }, { key: "threshold", label: "Low-stock threshold" },
      ], `stock-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`Exported ${n} rows`);
    } catch (e) { toast.fail(e); }
  }

  return (
    <>
      <PageHeader
        title="Stock levels"
        description="Sellable = on hand − reserved. Reservations are held for checkouts and released automatically. Adjustments can never push on-hand below reserved units and are written to the movement ledger."
        actions={<><Btn onClick={doExport}><Download className="size-4" /> Export CSV</Btn>{canWrite && <Btn variant="primary" onClick={() => setReceive(true)}><PackagePlus className="size-4" /> Receive stock</Btn>}</>}
      />
      <Card pad={false}>
        <FilterBar>
          <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="SKU or product" />
          <Toggle checked={f.lowStockOnly === "true"} onChange={(v) => set({ lowStockOnly: v ? "true" : "" })} label="Low / out of stock only" />
        </FilterBar>
        <DataTable
          rows={q.rows} loading={q.isLoading || q.isFetching} error={q.error} onRetry={() => q.refetch()} rowKey={(r) => r.variantId} pageSize={25}
          columns={[
            { key: "p", header: "Product", cell: (r) => <div><p className="font-medium">{r.productName}</p><p className="text-xs text-slate-500">{r.variantName} · <span className="font-mono">{r.sku}</span></p></div> },
            { key: "q", header: "On hand", align: "right", cell: (r) => r.quantity },
            { key: "r", header: "Reserved", align: "right", cell: (r) => r.reserved },
            { key: "a", header: "Sellable", align: "right", cell: (r) => <span className={r.available <= 0 ? "font-semibold text-rose-600" : r.isLow ? "font-semibold text-amber-700" : ""}>{r.available}</span> },
            { key: "t", header: "Low at", align: "right", cell: (r) => r.threshold },
            { key: "s", header: "Sold", align: "right", cell: (r) => r.sold },
            { key: "pr", header: "Price", align: "right", cell: (r) => fmtMoney(r.price) },
            { key: "st", header: "State", cell: (r) => r.available <= 0 ? <Badge tone="danger">{r.allowBackorder ? "Backorder" : "Out of stock"}</Badge> : r.isLow ? <Badge tone="warning">Low</Badge> : <Badge tone="success">OK</Badge> },
            ...(canWrite ? [{ key: "act", header: <span className="sr-only">Actions</span>, align: "right" as const, cell: (r: StockRow) => <div className="flex justify-end gap-1.5"><Btn size="sm" onClick={() => setAdjust(r)}>Adjust</Btn><Btn size="sm" variant="ghost" onClick={() => setPolicy(r)}>Policy</Btn></div> }] : []),
          ]}
          empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No stock records match.</p>}
        />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>
      {adjust && <AdjustDialog row={adjust} onClose={() => setAdjust(null)} />}
      {policy && <PolicyDialog row={policy} onClose={() => setPolicy(null)} />}
      {receive && <ReceiveDialog onClose={() => setReceive(false)} />}
    </>
  );
}

function AdjustDialog({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const [delta, setDelta] = useState("");
  const [type, setType] = useState("ADJUSTMENT");
  const [reason, setReason] = useState("");
  const d = Number(delta);
  const valid = Number.isInteger(d) && d !== 0 && reason.trim().length >= 3;
  const after = row.quantity + (Number.isInteger(d) ? d : 0);
  const blocked = Number.isInteger(d) && after < row.reserved;
  const m = useAdminMutation(() => api.post("/admin/inventory/adjust", { variantId: row.variantId, delta: d, type, reason: reason.trim() }), { success: "Stock adjusted", onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Adjust stock · ${row.sku}`} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!valid || blocked} loading={m.isPending} onClick={() => m.mutate()}>Apply adjustment</Btn></>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{row.productName} — {row.variantName}. On hand <strong>{row.quantity}</strong>, reserved <strong>{row.reserved}</strong>.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Change (+ add / − remove)" required error={blocked ? `On-hand cannot drop below reserved (${row.reserved})` : undefined}>{(id) => <Input id={id} inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. -3" />}</Field>
          <Field label="Type">{(id) => <Select id={id} value={type} onChange={(e) => setType(e.target.value)}>{["ADJUSTMENT", "DAMAGE", "CORRECTION", "RESTOCK"].map((t) => <option key={t}>{t}</option>)}</Select>}</Field>
        </div>
        <Field label="Reason (audited)" required>{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Cycle count correction, damaged in transit" />}</Field>
        {Number.isInteger(d) && d !== 0 && <p className="text-sm">New on-hand quantity: <strong>{after}</strong></p>}
      </div>
    </Modal>
  );
}

function PolicyDialog({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const [threshold, setThreshold] = useState(String(row.threshold));
  const [backorder, setBackorder] = useState(row.allowBackorder);
  const m = useAdminMutation(() => api.patch(`/admin/inventory/${row.variantId}`, { lowStockThreshold: Number(threshold), allowBackorder: backorder }), { success: "Inventory policy saved", onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Stock policy · ${row.sku}`} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" loading={m.isPending} disabled={!Number.isInteger(Number(threshold)) || Number(threshold) < 0} onClick={() => m.mutate()}>Save</Btn></>}>
      <div className="space-y-3">
        <Field label="Low-stock threshold">{(id) => <Input id={id} inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} />}</Field>
        <Toggle checked={backorder} onChange={setBackorder} label="Allow backorders (sell below zero sellable stock)" />
        {backorder && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">With backorders enabled this variant can oversell its physical stock. Keep this off unless you have confirmed supplier lead times.</p>}
      </div>
    </Modal>
  );
}

function ReceiveDialog({ onClose }: { onClose: () => void }) {
  const [reference, setReference] = useState("");
  const [supplier, setSupplier] = useState("");
  const [lines, setLines] = useState([{ sku: "", qty: "" }]);
  const m = useAdminMutation(async () => {
    const items: { variantId: string; quantity: number }[] = [];
    for (const l of lines.filter((x) => x.sku.trim())) {
      const qn = Number(l.qty);
      if (!Number.isInteger(qn) || qn < 1) throw new Error(`Quantity for ${l.sku} must be a whole number ≥ 1`);
      const res = await api.get<StockRow[]>("/admin/inventory", { search: l.sku.trim(), pageSize: 10 });
      const hit = res.data.find((r) => r.sku.toLowerCase() === l.sku.trim().toLowerCase());
      if (!hit) throw new Error(`No variant with SKU “${l.sku}”`);
      items.push({ variantId: hit.variantId, quantity: qn });
    }
    if (!items.length) throw new Error("Add at least one line");
    return api.post("/admin/inventory/receive", { reference: reference.trim(), supplier: supplier.trim() || undefined, items });
  }, { success: "Stock received", onSuccess: onClose });
  return (
    <Modal open wide onClose={onClose} title="Receive stock from supplier" footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={reference.trim().length < 3} loading={m.isPending} onClick={() => m.mutate()}>Record receipt</Btn></>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Receipt reference" required hint="Unique per receipt (PO / GRN number). A resubmitted reference cannot double-count stock.">{(id) => <Input id={id} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />}</Field>
          <Field label="Supplier">{(id) => <Input id={id} value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={120} />}</Field>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2">
            <Input aria-label={`SKU ${i + 1}`} placeholder="SKU (exact)" value={l.sku} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} />
            <Input aria-label={`Quantity ${i + 1}`} placeholder="Qty" inputMode="numeric" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
            <Btn variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</Btn>
          </div>
        ))}
        <Btn size="sm" onClick={() => setLines([...lines, { sku: "", qty: "" }])}>Add line</Btn>
      </div>
    </Modal>
  );
}
