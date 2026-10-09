"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, Loader2, RotateCcw, Search, X } from "lucide-react";
import { ProductGridCard, ProductGridSkeleton } from "./product-grid-card";
import { useApi, useBrands, useCategories, leafCategories } from "@/lib/shop/hooks";
import { errorMessage } from "@/lib/shop/api";
import { money } from "@/lib/shop/format";
import type { ListingMeta, ProductCard } from "@/lib/shop/types";

const SORTS: { value: string; label: string }[] = [
  { value: "relevance", label: "Recommended" },
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
  { value: "discount", label: "Biggest discount" },
  { value: "bestselling", label: "Best selling" },
];
const PAGE_SIZE = 12;

/** Filters live in the URL so a filtered view can be shared, bookmarked and survives refresh / back navigation. */
export function ProductsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const categories = leafCategories(useCategories()).filter((c) => c.productCount !== 0); // hide empty categories
  const allBrands = useBrands();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const brands = params.getAll("brand");
  const sort = params.get("sort") ?? "relevance";
  const inStock = params.get("inStock") === "true";
  const minRating = params.get("minRating") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const minPriceRupees = params.get("minPrice") ? Number(params.get("minPrice")) / 100 : "";
  const maxPriceRupees = params.get("maxPrice") ? Number(params.get("maxPrice")) / 100 : "";

  const paramString = params.toString();
  const query = useMemo(() => {
    const p = new URLSearchParams(paramString);
    return {
      q: p.get("q") || undefined, category: p.get("category") || undefined, brand: p.getAll("brand").length ? p.getAll("brand") : undefined,
      sort: p.get("sort") ?? "relevance", inStock: p.get("inStock") === "true" || undefined, minRating: p.get("minRating") || undefined,
      minPrice: p.get("minPrice") || undefined, maxPrice: p.get("maxPrice") || undefined,
      page: Math.max(1, Number(p.get("page")) || 1), pageSize: PAGE_SIZE, facets: true,
    };
  }, [paramString]);
  const { data, meta, error, loading, refreshing, reload } = useApi<ProductCard[], ListingMeta>("/products", query);

  const update = (patch: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      next.delete(k);
      if (Array.isArray(v)) v.forEach((x) => next.append(k, x));
      else if (v) next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page"); // any filter change returns to page 1
    const s = next.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const activeCount = Number(!!category) + brands.length + Number(inStock) + Number(!!minRating) + Number(!!params.get("minPrice") || !!params.get("maxPrice"));
  const clearAll = () => router.push(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false });

  // price inputs are uncontrolled (re-keyed when the URL value changes) and applied on blur / Enter, so typing never refetches
  const minRef = useRef<HTMLInputElement>(null);
  const maxRef = useRef<HTMLInputElement>(null);
  const applyPrice = () => {
    const toMinor = (v: string | undefined) => { const n = Number(v); return v && v.trim() !== "" && Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100)) : null; };
    update({ minPrice: toMinor(minRef.current?.value), maxPrice: toMinor(maxRef.current?.value) });
  };

  const facets = meta?.facets;
  const brandOptions = (facets?.brands?.length ? facets.brands : allBrands.filter((b) => (b.productCount ?? 1) > 0).map((b) => ({ ...b, count: b.productCount ?? 0, selected: brands.includes(b.slug) }))).filter((b) => b.slug);
  const currentCategory = categories.find((c) => c.slug === category);

  const filterPanel = (
    <div className="space-y-7">
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Category</legend>
        <div className="space-y-1">
          <button type="button" onClick={() => update({ category: null })} aria-pressed={!category} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${!category ? "bg-[#e9eadf] font-semibold" : "hover:bg-black/5"}`}>All electronics</button>
          {categories.map((c) => (
            <button key={c.slug} type="button" onClick={() => update({ category: c.slug })} aria-pressed={category === c.slug} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${category === c.slug ? "bg-[#e9eadf] font-semibold" : "hover:bg-black/5"}`}>
              <span>{c.name}</span>{typeof c.productCount === "number" && <span className="text-xs text-[#717168]">{c.productCount}</span>}
            </button>
          ))}
        </div>
      </fieldset>

      {brandOptions.length > 0 && (
        <fieldset>
          <legend className="mb-3 text-sm font-semibold">Brand</legend>
          <div className="space-y-1">
            {brandOptions.map((b) => (
              <label key={b.slug} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-black/5">
                <input type="checkbox" checked={brands.includes(b.slug!)} onChange={(e) => update({ brand: e.target.checked ? [...brands, b.slug!] : brands.filter((x) => x !== b.slug) })} className="h-4 w-4 accent-[#758446]" />
                <span className="flex-1">{b.name}</span><span className="text-xs text-[#717168]">{b.count}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Price (₹)</legend>
        <div className="flex items-center gap-2">
          <input key={`min-${minPriceRupees}`} ref={minRef} aria-label="Minimum price" inputMode="numeric" placeholder={facets?.priceRange ? String(Math.floor(facets.priceRange.min / 100)) : "Min"} defaultValue={String(minPriceRupees)} onBlur={applyPrice} onKeyDown={(e) => e.key === "Enter" && applyPrice()} className="w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#758446]" />
          <span className="text-[#77786f]">–</span>
          <input key={`max-${maxPriceRupees}`} ref={maxRef} aria-label="Maximum price" inputMode="numeric" placeholder={facets?.priceRange ? String(Math.ceil(facets.priceRange.max / 100)) : "Max"} defaultValue={String(maxPriceRupees)} onBlur={applyPrice} onKeyDown={(e) => e.key === "Enter" && applyPrice()} className="w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#758446]" />
        </div>
        {facets?.priceRange && <p className="mt-2 text-xs text-[#77786f]">Catalogue range {money(facets.priceRange.min)} – {money(facets.priceRange.max)}</p>}
      </fieldset>

      <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={inStock} onChange={(e) => update({ inStock: e.target.checked ? "true" : null })} className="h-4 w-4 accent-[#758446]" />
        In stock only
      </label>
      <label className="block text-sm font-semibold">
        Minimum rating
        <select value={minRating} onChange={(e) => update({ minRating: e.target.value || null })} className="mt-2 w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 font-normal outline-none focus:border-[#758446]">
          <option value="">Any rating</option><option value="4">4 stars &amp; up</option><option value="3">3 stars &amp; up</option>
        </select>
      </label>
      {activeCount > 0 && <button type="button" onClick={clearAll} className="inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4"><RotateCcw size={14} /> Clear all filters</button>}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
      <nav aria-label="Breadcrumb" className="text-xs text-[#77786f]"><Link href="/" className="hover:text-black">Home</Link> / <span className="text-[#20211e]">{currentCategory?.name ?? "All electronics"}</span></nav>
      <div className="mt-4 flex flex-col justify-between gap-4 border-b border-black/10 pb-6 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-4xl font-medium tracking-[-0.06em] sm:text-5xl">{q ? <>Results for “{q}”</> : currentCategory?.name ?? "All electronics"}<span className="text-[#87964f]">.</span></h1>
          <p className="mt-2 text-sm text-[#717168]" role="status" aria-live="polite">{meta ? `${meta.total} ${meta.total === 1 ? "product" : "products"}` : "Loading products…"}{refreshing && <Loader2 size={13} className="ml-2 inline animate-spin" aria-label="Updating" />}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form role="search" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("q"); update({ q: String(v ?? "").trim() || null }); }} className="flex h-11 items-center gap-2 rounded-full border border-black/15 bg-white px-4">
            <Search size={15} className="text-[#77786f]" aria-hidden />
            <input key={q} name="q" defaultValue={q} aria-label="Search products" placeholder="Search electronics" className="w-40 bg-transparent text-sm outline-none" />
            {q && <button type="button" aria-label="Clear search" onClick={() => update({ q: null })}><X size={14} /></button>}
          </form>
          <label className="sr-only" htmlFor="sort">Sort products</label>
          <select id="sort" value={sort} onChange={(e) => update({ sort: e.target.value === "relevance" ? null : e.target.value })} className="h-11 rounded-full border border-black/15 bg-white px-4 text-sm outline-none focus:border-[#758446]">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button type="button" onClick={() => setFiltersOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-full border border-black/20 bg-[#faf9f6] px-5 text-sm font-semibold lg:hidden"><Filter size={16} /> Filters{activeCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#d6ed79] px-1 text-[10px]">{activeCount}</span>}</button>
        </div>
      </div>

      {(activeCount > 0 || q) && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Active filters">
          {category && <li><button type="button" onClick={() => update({ category: null })} className="inline-flex items-center gap-1.5 rounded-full bg-[#e9eadf] px-3 py-1.5 text-xs font-medium">{currentCategory?.name ?? category} <X size={12} aria-label="Remove category filter" /></button></li>}
          {brands.map((b) => <li key={b}><button type="button" onClick={() => update({ brand: brands.filter((x) => x !== b) })} className="inline-flex items-center gap-1.5 rounded-full bg-[#e9eadf] px-3 py-1.5 text-xs font-medium">{allBrands.find((x) => x.slug === b)?.name ?? b} <X size={12} aria-label={`Remove ${b} filter`} /></button></li>)}
          {inStock && <li><button type="button" onClick={() => update({ inStock: null })} className="inline-flex items-center gap-1.5 rounded-full bg-[#e9eadf] px-3 py-1.5 text-xs font-medium">In stock <X size={12} aria-label="Remove in-stock filter" /></button></li>}
        </ul>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[250px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">{filterPanel}</aside>
        <section aria-live="polite" aria-busy={loading}>
          {error && !data ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
              <p className="font-semibold text-red-900">We couldn&apos;t load the products.</p>
              <p className="mt-1 text-sm text-red-800">{errorMessage(error)}</p>
              <button type="button" onClick={reload} className="mt-4 rounded-full bg-[#22231f] px-5 py-2.5 text-sm font-semibold text-white">Try again</button>
            </div>
          ) : loading ? (
            <ProductGridSkeleton count={PAGE_SIZE} />
          ) : data && data.length === 0 ? (
            <div className="rounded-xl border border-black/10 bg-white p-10 text-center">
              <p className="text-xl font-medium">{meta?.emptyState?.message ?? "No products match these filters."}</p>
              <p className="mt-2 text-sm text-[#717168]">Try removing a filter or searching for something broader.</p>
              <button type="button" onClick={clearAll} className="mt-5 rounded-full bg-[#22231f] px-5 py-2.5 text-sm font-semibold text-white">Clear filters</button>
              {meta?.emptyState?.popularProducts && meta.emptyState.popularProducts.length > 0 && (
                <div className="mt-10 text-left"><h2 className="mb-4 text-sm font-semibold">Popular right now</h2><div className="grid grid-cols-2 gap-4 lg:grid-cols-3">{meta.emptyState.popularProducts.slice(0, 3).map((p) => <ProductGridCard key={p.id} product={p} />)}</div></div>
              )}
            </div>
          ) : (
            <>
              {error && <p role="alert" className="mb-4 text-sm text-red-700">Couldn&apos;t refresh the list ({errorMessage(error)}). Showing the previous results. <button className="underline" onClick={reload}>Retry</button></p>}
              <div className={`grid grid-cols-2 gap-x-3 gap-y-6 transition-opacity sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4 ${refreshing ? "opacity-60" : ""}`}>
                {data!.map((p, i) => <ProductGridCard key={p.id} product={p} priority={i < 4} />)}
              </div>
              {meta && meta.totalPages > 1 && (
                <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3">
                  <button type="button" disabled={!meta.hasPreviousPage} onClick={() => update({ page: String(page - 1) })} className="inline-flex h-10 items-center gap-1 rounded-full border border-black/15 px-4 text-sm disabled:opacity-40"><ChevronLeft size={15} /> Previous</button>
                  <span className="text-sm text-[#717168]">Page {meta.page} of {meta.totalPages}</span>
                  <button type="button" disabled={!meta.hasNextPage} onClick={() => update({ page: String(page + 1) })} className="inline-flex h-10 items-center gap-1 rounded-full border border-black/15 px-4 text-sm disabled:opacity-40">Next <ChevronRight size={15} /></button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} className="absolute inset-0 bg-black/40" />
          <aside role="dialog" aria-modal="true" aria-labelledby="filters-title" className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-[#faf9f6] shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/10 px-6 py-5"><h2 id="filters-title" className="text-xl font-semibold">Filter electronics</h2><button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} className="rounded-full p-2 hover:bg-black/5"><X size={20} /></button></div>
            <div className="flex-1 overflow-y-auto px-6 py-6">{filterPanel}</div>
            <div className="border-t border-black/10 p-6"><button type="button" onClick={() => setFiltersOpen(false)} className="w-full rounded-full bg-[#22231f] px-5 py-3 text-sm font-semibold text-white">Show {meta?.total ?? ""} products</button></div>
          </aside>
        </div>
      )}
    </div>
  );
}
