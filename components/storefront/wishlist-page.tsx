"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { ProductGridCard, ProductGridSkeleton } from "./product-grid-card";
import { useRequireCustomer } from "./account-orders";
import { errorMessage } from "@/lib/shop/api";
import { useApi } from "@/lib/shop/hooks";
import { money } from "@/lib/shop/format";
import type { ProductCard } from "@/lib/shop/types";

interface Item { id: string; product: ProductCard; priceChange: { from: number; to: number; dropped: boolean } | null }

export function WishlistPage() {
  const { user, wishlist } = useRequireCustomer("/account/wishlist");
  const { data, error, loading, reload } = useApi<{ items: Item[] }>(user ? "/wishlist" : null);
  // the heart toggles optimistically in the shared provider; hide items the shopper has just removed
  const items = data?.items.filter((i) => wishlist.has(i.product.id)) ?? [];
  return (
    <div className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <h1 className="text-4xl font-medium tracking-[-0.06em]">Wishlist<span className="text-[#87964f]">.</span></h1>
      <div className="mt-8">
        {loading && !data ? <ProductGridSkeleton count={4} /> : error && !data ? <p role="alert" className="text-sm text-red-800">{errorMessage(error)} <button className="underline" onClick={reload}>Retry</button></p> : items.length === 0 ? (
          <div className="rounded-xl border border-black/10 bg-white p-12 text-center"><Heart size={34} strokeWidth={1.2} className="mx-auto text-[#77786f]" aria-hidden /><p className="mt-4 text-xl font-medium">Nothing saved yet</p><p className="mt-1 text-sm text-[#717168]">Tap the heart on any product to keep it here.</p><Link href="/products" className="mt-6 inline-block rounded-full bg-[#22231f] px-6 py-3 text-sm font-semibold text-white">Browse electronics</Link></div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{items.map((i) => (
            <div key={i.id}>{i.priceChange && <p className="mb-1 text-xs text-[#53652e]">{i.priceChange.dropped ? "Price dropped" : "Price changed"}: {money(i.priceChange.from)} → {money(i.priceChange.to)}</p>}<ProductGridCard product={i.product} /></div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
