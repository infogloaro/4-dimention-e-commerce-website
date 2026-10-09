"use client";

import { Thumb } from "@/components/admin/thumb";
import { Download, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { exportCsv, useAdminMutation, useDataQuery, usePagedQuery } from "@/components/admin/data";
import { RequirePermission, useAuth } from "@/components/admin/providers";
import { Badge, Btn, Card, ConfirmDialog, DataTable, Field, FilterBar, Input, LinkBtn, PageHeader, Pagination, SearchBox, Select, StatusBadge, useToast, useUrlState } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";
import { fmtDate, fmtMoney } from "@/lib/admin/format";

export interface ProductRow { id: string; name: string; slug: string; status: string; category: string; brand: string | null; image: string | null; minPrice: number; maxPrice: number; inStock: boolean; soldCount: number; variantCount: number; skus: string[]; stockOnHand: number; updatedAt: string }
interface Cat { id: string; name: string; depth: number }

type Bulk = null | { action: "publish" | "unpublish" | "archive" | "feature" | "unfeature" | "set_category" | "adjust_price_percent" };

export default function ProductsPage() {
  return (
    <RequirePermission anyOf={["product:read"]}>
      <Products />
    </RequirePermission>
  );
}

function Products() {
  const router = useRouter();
  const toast = useToast();
  const { can } = useAuth();
  const [f, set] = useUrlState({ search: "", status: "", categoryId: "", page: "1" });
  const q = usePagedQuery<ProductRow>("products", "/admin/products", { search: f.search, status: f.status, categoryId: f.categoryId, page: Number(f.page), pageSize: 20 });
  const cats = useDataQuery<Cat[]>(["categories-options"], "/admin/categories");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<Bulk>(null);
  const [category, setCategory] = useState("");
  const [percent, setPercent] = useState("");
  const [exporting, setExporting] = useState(false);
  const canWrite = can("product:write");

  const rows = q.rows;
  const selectedRows = useMemo(() => (rows ?? []).filter((r) => sel.has(r.id)), [rows, sel]);
  const allOnPage = !!rows?.length && rows.every((r) => sel.has(r.id));
  const pct = Number(percent);
  const pctValid = percent.trim() !== "" && Number.isFinite(pct) && pct >= -90 && pct <= 500 && pct !== 0;

  const run = useAdminMutation((b: { action: string; categoryId?: string; percent?: number }) => api.post<{ affected?: number }>("/admin/products/bulk", { ids: [...sel], ...b }), {
    success: "Bulk action applied", onSuccess: () => { setSel(new Set()); setBulk(null); setPercent(""); setCategory(""); },
  });

  async function doExport() {
    setExporting(true);
    try {
      const n = await exportCsv<ProductRow>("/admin/products", { search: f.search, status: f.status, categoryId: f.categoryId }, [
        { key: "name", label: "Name" }, { key: "skus", label: "SKUs", get: (r) => r.skus.join(" | ") }, { key: "brand", label: "Brand" }, { key: "category", label: "Category" },
        { key: "status", label: "Status" }, { key: "minPrice", label: "Min price (paise)" }, { key: "maxPrice", label: "Max price (paise)" }, { key: "stockOnHand", label: "Stock on hand" }, { key: "updatedAt", label: "Updated (UTC)" },
      ], `products-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`Exported ${n} products`);
    } catch (e) { toast.fail(e); } finally { setExporting(false); }
  }

  const bulkTitle: Record<string, string> = { publish: "Publish", unpublish: "Move to draft", archive: "Archive", feature: "Feature", unfeature: "Unfeature", set_category: "Change category", adjust_price_percent: "Adjust prices" };

  return (
    <>
      <PageHeader
        title="Products"
        description="Catalogue including drafts and archived items. Publication, price and stock changes take effect on the storefront immediately; historical orders keep their price snapshots."
        actions={<><Btn onClick={doExport} loading={exporting}><Download className="size-4" /> Export CSV</Btn>{canWrite && <LinkBtn href="/admin/products/new" variant="primary"><Plus className="size-4" /> New product</LinkBtn>}</>}
      />
      <Card pad={false}>
        <FilterBar>
          <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="Name, SKU, brand" />
          <Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} className="w-36">
            <option value="">All statuses</option><option value="ACTIVE">Published</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option>
          </Select>
          <Select aria-label="Category" value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })} className="w-56">
            <option value="">All categories</option>
            {cats.data?.map((c) => <option key={c.id} value={c.id}>{"— ".repeat(c.depth)}{c.name}</option>)}
          </Select>
        </FilterBar>
        {sel.size > 0 && canWrite && (
          <div className="flex flex-wrap items-center gap-2 border-b border-indigo-100 bg-indigo-50 px-4 py-2 text-sm">
            <strong>{sel.size} selected</strong>
            <Btn size="sm" onClick={() => setBulk({ action: "publish" })}>Publish</Btn>
            <Btn size="sm" onClick={() => setBulk({ action: "unpublish" })}>Unpublish</Btn>
            <Btn size="sm" onClick={() => setBulk({ action: "feature" })}>Feature</Btn>
            <Btn size="sm" onClick={() => setBulk({ action: "unfeature" })}>Unfeature</Btn>
            <Btn size="sm" onClick={() => setBulk({ action: "set_category" })}>Change category</Btn>
            <Btn size="sm" onClick={() => setBulk({ action: "adjust_price_percent" })}>Adjust price %</Btn>
            {can("product:delete") && <Btn size="sm" variant="danger" onClick={() => setBulk({ action: "archive" })}>Archive</Btn>}
            <Btn size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Btn>
          </div>
        )}
        <DataTable
          rows={rows}
          loading={q.isLoading || q.isFetching}
          error={q.error}
          onRetry={() => q.refetch()}
          rowKey={(p) => p.id}
          pageSize={20}
          onRowClick={(p) => router.push(`/admin/products/${p.id}`)}
          columns={[
            ...(canWrite ? [{ key: "sel", header: <input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={(e) => setSel(e.target.checked ? new Set([...sel, ...(rows ?? []).map((r) => r.id)]) : new Set([...sel].filter((id) => !(rows ?? []).some((r) => r.id === id))))} />, cell: (p: ProductRow) => <span onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${p.name}`} checked={sel.has(p.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(p.id); else n.delete(p.id); setSel(n); }} /></span>, className: "w-10" }] : []),
            { key: "p", header: "Product", cell: (p) => (
              <div className="flex items-center gap-3">
                { }
                <Thumb src={p.image} alt={p.name} className="size-10 rounded-lg border border-slate-200 object-cover" />
                <div className="min-w-0"><Link href={`/admin/products/${p.id}`} onClick={(e) => e.stopPropagation()} className="block max-w-xs truncate font-medium text-slate-900 hover:text-indigo-700">{p.name}</Link><p className="truncate font-mono text-xs text-slate-500">{p.skus[0]}{p.skus.length > 1 && ` +${p.skus.length - 1}`}</p></div>
              </div>
            ) },
            { key: "b", header: "Brand / category", cell: (p) => <div className="text-xs"><p className="text-slate-800">{p.brand ?? "—"}</p><p className="text-slate-500">{p.category}</p></div> },
            { key: "pr", header: "Price", align: "right", cell: (p) => p.minPrice === p.maxPrice ? fmtMoney(p.minPrice) : `${fmtMoney(p.minPrice)} – ${fmtMoney(p.maxPrice)}` },
            { key: "st", header: "Stock", align: "right", cell: (p) => <span className={p.stockOnHand <= 0 ? "font-semibold text-rose-600" : ""}>{p.stockOnHand}</span> },
            { key: "s", header: "Status", cell: (p) => <div className="flex flex-col items-start gap-0.5"><StatusBadge status={p.status} />{p.status === "ACTIVE" && !p.inStock && <Badge tone="danger">Out of stock</Badge>}</div> },
            { key: "u", header: "Updated", cell: (p) => <span className="text-xs text-slate-500">{fmtDate(p.updatedAt, false)}</span> },
          ]}
          empty={<p className="px-4 py-12 text-center text-sm text-slate-500">No products match these filters.</p>}
        />
        <Pagination meta={q.meta} onPage={(p) => set({ page: String(p) }, false)} />
      </Card>

      <ConfirmDialog
        open={!!bulk} onClose={() => setBulk(null)} busy={run.isPending} danger={bulk?.action === "archive"}
        title={bulk ? `${bulkTitle[bulk.action]} ${sel.size} product(s)?` : ""}
        confirmLabel="Apply to selected"
        confirmDisabled={(bulk?.action === "set_category" && !category) || (bulk?.action === "adjust_price_percent" && !pctValid)}
        onConfirm={() => { if (bulk) run.mutate({ action: bulk.action, categoryId: bulk.action === "set_category" ? category : undefined, percent: bulk.action === "adjust_price_percent" ? pct : undefined }) }}
        impact={bulk?.action === "adjust_price_percent" ? "Prices of ALL variants (and compare-at prices) of the selected products change immediately on the storefront. Existing orders are unaffected." : bulk?.action === "archive" ? "Archived products are hidden from the storefront. Order history keeps its snapshots." : "The change is applied in one transaction and recorded in the audit log."}
        description={bulk && (
          <div className="space-y-3">
            <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-slate-600">{selectedRows.map((r) => <li key={r.id}>{r.name}</li>)}{sel.size > selectedRows.length && <li>…and {sel.size - selectedRows.length} on other pages</li>}</ul>
            {bulk.action === "set_category" && <Field label="New category" required>{(id) => <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Select…</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{"— ".repeat(c.depth)}{c.name}</option>)}</Select>}</Field>}
            {bulk.action === "adjust_price_percent" && (
              <>
                <Field label="Change prices by (%)" hint="Negative to reduce, e.g. -10. Allowed −90 to +500." required error={percent && !pctValid ? "Enter a non-zero percentage between −90 and 500" : undefined}>{(id) => <Input id={id} inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />}</Field>
                {pctValid && <div className="rounded-lg border border-slate-200 p-2 text-xs"><p className="mb-1 font-semibold">Preview (lowest variant price)</p>{selectedRows.slice(0, 5).map((r) => <p key={r.id} className="flex justify-between"><span className="truncate">{r.name}</span><span className="tabular-nums">{fmtMoney(r.minPrice)} → {fmtMoney(Math.max(0, Math.round(r.minPrice * (1 + pct / 100))))}</span></p>)}</div>}
              </>
            )}
          </div>
        )}
      />
    </>
  );
}
