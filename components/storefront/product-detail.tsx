"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, Heart, Minus, Plus, ShoppingBag, Star, Truck } from "lucide-react";
import { ProductImage, SafeImg } from "./product-image";
import { ProductGridCard } from "./product-grid-card";
import { useShop } from "./shop-provider";
import { api } from "@/lib/shop/api";
import { useApi } from "@/lib/shop/hooks";
import { formatDate, money } from "@/lib/shop/format";
import type { ProductCard, ProductDetail } from "@/lib/shop/types";

interface Review { id: string; rating: number; title: string | null; body: string | null; isVerifiedPurchase: boolean; author: { name: string }; createdAt: string }
interface Recs { related: ProductCard[]; frequentlyBoughtTogether: ProductCard[] }

/** Picks the variant that has `key=value`, keeping as many of the other current selections as possible (in-stock preferred). */
function pickVariant(product: ProductDetail, current: Record<string, string>, key: string, value: string) {
  const wanted = { ...current, [key]: value };
  const score = (v: ProductDetail["variants"][number]) => Object.entries(wanted).filter(([k, val]) => v.options[k] === val).length * 10 + (v.availability.inStock ? 1 : 0);
  return product.variants.filter((v) => v.options[key] === value).sort((a, b) => score(b) - score(a))[0];
}

export function ProductDetailView({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const { addToCart, cartBusy, wishlist, toggleWishlist } = useShop();
  const initial = product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0];
  const [variantId, setVariantId] = useState(initial?.id ?? "");
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [buying, setBuying] = useState(false);

  const variant = product.variants.find((v) => v.id === variantId) ?? initial;
  const selected = variant?.options ?? {};
  const maxQty = Math.max(1, Math.min(variant?.availability.maxPurchasable ?? 1, product.maxQuantityPerOrder));

  // gallery: the selected variant's own images first, then the product-level ones; each URL once
  const gallery = useMemo(() => {
    const own = product.media.filter((m) => m.type === "IMAGE" && variant && m.variantId === variant.id);
    const shared = product.media.filter((m) => m.type === "IMAGE" && m.variantId === null);
    const seen = new Set<string>();
    return [...own, ...shared].filter((m) => !seen.has(m.url) && seen.add(m.url));
  }, [product.media, variant]);
  const main = gallery[Math.min(activeImage, gallery.length - 1)];

  useEffect(() => { void api.post(`/products/${product.slug}/view`).catch(() => undefined); }, [product.slug]);

  const reviews = useApi<Review[], { summary: { average: number; count: number } }>(`/products/${product.slug}/reviews`, { pageSize: 5 });
  const recs = useApi<Recs>(`/products/${product.slug}/recommendations`);
  const related = [...(recs.data?.related ?? []), ...(recs.data?.frequentlyBoughtTogether ?? [])].filter((p) => p.id !== product.id).slice(0, 4);

  const price = variant?.price ?? product.price;
  const sale = price && price.compareAtPrice && price.onSale;
  const canBuy = !!variant?.availability.inStock;
  const saved = wishlist.has(product.id);
  const warranty = product.specifications.flatMap((g) => g.items).find((i) => /warranty/i.test(i.name));

  const choose = (key: string, value: string) => {
    const v = pickVariant(product, selected, key, value);
    if (v) { setVariantId(v.id); setQty(1); setActiveImage(0); }
  };

  const add = async (thenCheckout: boolean) => {
    if (!variant) return;
    setBuying(thenCheckout);
    const ok = await addToCart(variant.id, qty, product.name);
    setBuying(false);
    if (ok && thenCheckout) router.push("/checkout");
  };

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1 text-xs text-[#77786f]">
        <Link href="/" className="hover:text-black">Home</Link>/<Link href="/products" className="hover:text-black">Electronics</Link>/
        <Link href={`/products?category=${product.category.slug}`} className="hover:text-black">{product.category.name}</Link>/<span className="text-[#20211e]">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <section aria-label="Product images">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-[#f0efe9]">
            <ProductImage key={main?.url ?? "none"} src={main?.url} alt={main?.alt ?? product.name} category={product.category.slug} fit="contain" priority width={1000} height={1000} />
          </div>
          {gallery.length > 1 && (
            <ul className="mt-3 flex gap-2 overflow-x-auto" aria-label="Choose image">
              {gallery.map((m, i) => (
                <li key={m.url}>
                  <button type="button" onClick={() => setActiveImage(i)} aria-label={`Show image ${i + 1}: ${m.alt}`} aria-pressed={i === activeImage} className={`block h-16 w-16 overflow-hidden rounded-lg border bg-[#f0efe9] sm:h-20 sm:w-20 ${i === activeImage ? "border-[#758446] ring-1 ring-[#758446]" : "border-black/10"}`}>
                    <SafeImg src={m.thumbnailUrl ?? m.url} alt="" category={product.category.slug} className="h-full w-full object-cover" width={80} height={80} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] leading-4 text-[#92938b]">Illustrative product rendering. Colour and model follow the selected option.</p>
        </section>

        <section>
          <p className="text-[10px] tracking-[0.16em] text-[#77786f]">{(product.brand?.name ?? product.category.name).toUpperCase()}</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">{product.name}</h1>
          {product.rating.count > 0 && <p className="mt-3 flex items-center gap-1.5 text-sm text-[#62635b]"><Star size={15} className="fill-current text-[#758446]" aria-hidden /> {product.rating.average.toFixed(1)} <span className="text-[#77786f]">({product.rating.count} review{product.rating.count === 1 ? "" : "s"})</span></p>}
          {product.shortDescription && <p className="mt-4 text-[15px] leading-7 text-[#65665e]">{product.shortDescription}</p>}

          <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-live="polite">
            <span className="text-3xl font-semibold">{price ? money(price.price) : "—"}</span>
            {sale && <span className="text-base text-[#8a8b82] line-through">{money(price!.compareAtPrice)}</span>}
            {sale && <span className="rounded bg-[#d6ed79] px-2 py-0.5 text-xs font-semibold text-[#22231f]">{price!.discountPercent}% off</span>}
          </div>
          <p className="mt-1 text-xs text-[#77786f]">{product.pricesIncludeTax ? "Inclusive of all taxes." : "Taxes added at checkout."} Delivery is calculated at checkout.</p>

          {product.options.map((opt) => (
            <fieldset key={opt.key} className="mt-6">
              <legend className="text-sm font-semibold">{opt.name}: <span className="font-normal text-[#62635b]">{selected[opt.key]}</span></legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {opt.values.map((val) => {
                  const active = selected[opt.key] === val.value;
                  return (
                    <button key={val.value} type="button" onClick={() => choose(opt.key, val.value)} aria-pressed={active} disabled={!val.available} title={val.available ? val.value : `${val.value} — out of stock`}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through ${active ? "border-[#22231f] bg-[#22231f] text-white" : "border-black/20 hover:border-black/50"}`}>
                      {opt.key === "color" && val.swatch && <span className="h-4 w-4 rounded-full border border-black/20" style={{ backgroundColor: val.swatch }} aria-hidden />}
                      {val.value}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <p className={`mt-5 flex items-center gap-2 text-sm font-medium ${canBuy ? (variant?.availability.lowStock ? "text-amber-700" : "text-[#53652e]") : "text-red-700"}`} role="status">
            {canBuy && <Check size={15} aria-hidden />}{variant?.availability.message ?? "Unavailable"}{variant && <span className="font-normal text-[#77786f]"> · SKU {variant.sku}</span>}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-full border border-black/15 px-1.5 py-1" role="group" aria-label="Quantity">
              <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty(qty - 1)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5 disabled:opacity-40"><Minus size={15} /></button>
              <span className="min-w-8 text-center text-sm font-medium" aria-live="polite">{qty}</span>
              <button type="button" aria-label="Increase quantity" disabled={qty >= maxQty || !canBuy} onClick={() => setQty(qty + 1)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5 disabled:opacity-40"><Plus size={15} /></button>
            </div>
            <button type="button" disabled={!canBuy || cartBusy} onClick={() => add(false)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#22231f] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#44463b] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"><ShoppingBag size={16} aria-hidden /> Add to bag</button>
            <button type="button" disabled={!canBuy || cartBusy} onClick={() => add(true)} className="inline-flex flex-1 items-center justify-center rounded-full border border-[#22231f] px-6 py-3.5 text-sm font-semibold transition hover:bg-[#22231f] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none">{buying ? "Adding…" : "Buy now"}</button>
            <button type="button" onClick={() => toggleWishlist(product.id, product.name)} aria-pressed={saved} aria-label={saved ? "Remove from wishlist" : "Save to wishlist"} className={`grid h-12 w-12 place-items-center rounded-full border transition ${saved ? "border-[#d6ed79] bg-[#d6ed79]" : "border-black/15 hover:border-black/40"}`}><Heart size={18} fill={saved ? "currentColor" : "none"} /></button>
          </div>
          {qty >= maxQty && canBuy && <p className="mt-2 text-xs text-[#77786f]">Maximum {maxQty} per order for this option.</p>}

          <ul className="mt-6 space-y-2 border-t border-black/10 pt-5 text-sm text-[#52534b]">
            <li className="flex items-center gap-2"><Truck size={16} aria-hidden /> Delivery estimate shown at checkout for your address</li>
            {warranty && <li className="flex items-center gap-2"><Check size={16} aria-hidden /> Warranty: {warranty.value}</li>}
            {product.offers.slice(0, 2).map((o) => <li key={o.code} className="flex items-center gap-2"><Check size={16} aria-hidden /> <span><strong>{o.code}</strong> — {o.description}</span></li>)}
          </ul>
        </section>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold">About this product</h2>
          {product.description && <p className="mt-3 text-sm leading-7 text-[#65665e]">{product.description}</p>}
          {product.highlights.length > 0 && <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-[#52534b]">{product.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
        </section>
        <section>
          <h2 className="text-xl font-semibold">Specifications</h2>
          {product.specifications.length === 0 ? <p className="mt-3 text-sm text-[#77786f]">No specifications have been listed yet.</p> : product.specifications.map((g) => (
            <div key={g.group} className="mt-4">
              <h3 className="text-xs font-semibold tracking-[0.12em] text-[#77786f]">{g.group.toUpperCase()}</h3>
              <dl className="mt-1 divide-y divide-black/5 text-sm">{g.items.map((i) => <div key={i.name} className="flex justify-between gap-4 py-2"><dt className="text-[#77786f]">{i.name}</dt><dd className="text-right font-medium">{i.value}{i.unit ? ` ${i.unit}` : ""}</dd></div>)}</dl>
            </div>
          ))}
        </section>
      </div>

      <section className="mt-14" aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" className="text-xl font-semibold">Customer reviews</h2>
        {reviews.loading ? <p className="mt-3 text-sm text-[#77786f]">Loading reviews…</p> : reviews.error ? <p role="alert" className="mt-3 text-sm text-red-700">Reviews couldn&apos;t be loaded. <button className="underline" onClick={reviews.reload}>Retry</button></p> : !reviews.data?.length ? <p className="mt-3 text-sm text-[#77786f]">No reviews yet. Reviews can be written after a purchase is delivered.</p> : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">{reviews.data.map((r) => (
            <li key={r.id} className="rounded-xl border border-black/10 bg-white p-5">
              <p className="flex items-center gap-1 text-sm" aria-label={`${r.rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} className={i < r.rating ? "fill-current text-[#758446]" : "text-black/20"} aria-hidden />)}</p>
              {r.title && <p className="mt-2 font-medium">{r.title}</p>}
              {r.body && <p className="mt-1 text-sm leading-6 text-[#65665e]">{r.body}</p>}
              <p className="mt-3 text-xs text-[#77786f]">{r.author.name} · {formatDate(r.createdAt)}{r.isVerifiedPurchase && <span className="ml-2 rounded bg-[#eff3e3] px-1.5 py-0.5 text-[#53652e]">Verified purchase</span>}</p>
            </li>))}</ul>
        )}
      </section>

      {related.length > 0 && (
        <section className="mt-14" aria-labelledby="related-heading">
          <h2 id="related-heading" className="text-xl font-semibold">You may also like</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">{related.map((p) => <ProductGridCard key={p.id} product={p} />)}</div>
        </section>
      )}
    </div>
  );
}
