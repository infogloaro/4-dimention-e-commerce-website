"use client";

import Link from "next/link";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { ProductImage } from "./product-image";
import { useShop } from "./shop-provider";
import { money } from "@/lib/shop/format";
import type { ProductCard } from "@/lib/shop/types";

/**
 * Product card used by listing, search, wishlist and "related" rails. Everything shown (image, name, price, stock) comes
 * from the same API record, so the picture can only be the product's own. Products with options send the shopper to the
 * product page to choose a variant instead of silently adding a default one.
 */
export function ProductGridCard({ product, priority = false }: { product: ProductCard; priority?: boolean }) {
  const { addToCart, wishlist, toggleWishlist, cartBusy } = useShop();
  const saved = wishlist.has(product.id);
  const href = `/products/${product.slug}`;
  const sale = product.price.discountPercent > 0 && product.price.compareAtPrice;
  const low = product.stockStatus === "LOW_STOCK";

  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg">
      <div className="relative">
        <Link href={href} aria-label={`View ${product.name}`} className="block bg-[#f0efe9]">
          <ProductImage src={product.image?.url} alt={product.image?.alt ?? product.name} category={product.category.slug} fit="cover" ratio="1 / 1" priority={priority} className="transition-opacity duration-300 group-hover:opacity-0" />
          {product.hoverImage && (
            <ProductImage src={product.hoverImage.url} alt={product.hoverImage.alt} category={product.category.slug} fit="cover" ratio="1 / 1" boxClassName="!absolute inset-0 h-full w-full opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          )}
        </Link>
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1 sm:left-3 sm:top-3">
          {!product.inStock && <span className="bg-[#22231f] px-2 py-1.5 text-[8px] font-semibold tracking-[0.1em] text-white sm:text-[9px]">SOLD OUT</span>}
          {product.inStock && product.badges.slice(0, 2).map((b) => <span key={b.key} className="bg-[#faf9f6]/95 px-2 py-1.5 text-[8px] tracking-[0.1em] text-[#46473f] sm:text-[9px]">{b.label.toUpperCase()}</span>)}
        </div>
        <button type="button" onClick={() => toggleWishlist(product.id, product.name)} aria-pressed={saved} aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`} className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md transition sm:right-3 sm:top-3 ${saved ? "bg-[#d6ed79] text-[#262720]" : "bg-white/85 text-[#262720] hover:bg-white"}`}>
          <Heart size={16} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <p className="text-[9px] tracking-[0.12em] text-[#77786f] sm:text-[10px]">
          {(product.brand?.name ?? product.category.name).toUpperCase()}
          {product.rating.count > 0 && <><span className="mx-1">·</span><Star size={9} className="mb-0.5 inline fill-current" aria-hidden /> {product.rating.average.toFixed(1)} <span className="sr-only">out of 5 from {product.rating.count} reviews</span></>}
        </p>
        <Link href={href} className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-5 tracking-[-0.02em] hover:underline hover:underline-offset-2 sm:text-[15px]">{product.name}</Link>

        {product.swatches.length > 1 && (
          <ul className="mt-2 flex items-center gap-1" aria-label="Available colours">
            {product.swatches.map((s) => <li key={s.value} title={s.value} className="h-3.5 w-3.5 rounded-full border border-black/15" style={{ backgroundColor: s.swatch ?? "#ccc" }}><span className="sr-only">{s.value}</span></li>)}
          </ul>
        )}

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-semibold sm:text-sm">{product.price.from ? "From " : ""}{money(product.price.price)}</span>
          {sale && <span className="text-[10px] text-[#8a8b82] line-through">{money(product.price.compareAtPrice)}</span>}
          {sale && <span className="text-[10px] font-semibold text-[#53652e]">{product.price.discountPercent}% off</span>}
        </div>
        {low && product.inStock && <p className="mt-1 text-[11px] font-medium text-amber-700">Only a few left</p>}

        <div className="mt-auto pt-3">
          {!product.inStock ? (
            <Link href={href} className="flex w-full items-center justify-center rounded-full border border-black/15 px-3 py-2.5 text-xs font-semibold text-[#62635b]">Out of stock — details</Link>
          ) : product.hasVariants || !product.defaultVariantId ? (
            <Link href={href} className="flex w-full items-center justify-center rounded-full border border-black/20 px-3 py-2.5 text-xs font-semibold transition hover:border-[#22231f] hover:bg-[#22231f] hover:text-white">Choose options</Link>
          ) : (
            <button type="button" disabled={cartBusy} onClick={() => addToCart(product.defaultVariantId!, 1, product.name)} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#22231f] px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-[#44463b] disabled:opacity-60"><ShoppingBag size={14} aria-hidden /> Add to bag</button>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-black/10 bg-white">
          <div className="aspect-square animate-pulse bg-[#ebeae2]" />
          <div className="space-y-2 p-4"><div className="h-2.5 w-1/3 animate-pulse rounded bg-[#ebeae2]" /><div className="h-4 w-4/5 animate-pulse rounded bg-[#ebeae2]" /><div className="h-4 w-1/3 animate-pulse rounded bg-[#ebeae2]" /></div>
        </div>
      ))}
    </div>
  );
}
