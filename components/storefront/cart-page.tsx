"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Minus, Plus, ShoppingBag, Tag, X } from "lucide-react";
import { ProductImage } from "./product-image";
import { useShop } from "./shop-provider";
import { money } from "@/lib/shop/format";

export function PriceSummary({ pricing }: { pricing: import("@/lib/shop/types").Pricing }) {
  const row = "flex justify-between text-sm";
  return (
    <dl className="space-y-2.5">
      <div className={row}><dt className="text-[#717168]">Subtotal</dt><dd>{money(pricing.subtotal)}</dd></div>
      {pricing.couponDiscount > 0 && <div className={`${row} text-[#53652e]`}><dt>Coupon discount</dt><dd>−{money(pricing.couponDiscount)}</dd></div>}
      <div className={row}><dt className="text-[#717168]">Delivery</dt><dd>{pricing.shippingTotal === 0 ? "Free" : money(pricing.shippingTotal)}</dd></div>
      <div className={row}><dt className="text-[#717168]">{pricing.pricesIncludeTax ? "Tax (included)" : "Tax"}</dt><dd>{money(pricing.taxTotal)}</dd></div>
      <div className="flex justify-between border-t border-black/10 pt-3 text-base font-semibold"><dt>Total</dt><dd>{money(pricing.grandTotal)}</dd></div>
      {pricing.totalSavings > 0 && <p className="text-xs text-[#53652e]">You save {money(pricing.totalSavings)} on this order</p>}
    </dl>
  );
}

export function CouponBox() {
  const { cart, applyCoupon, removeCoupon, cartBusy } = useShop();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    const problem = await applyCoupon(code.trim());
    setError(problem);
    if (!problem) setCode("");
  };
  return (
    <div>
      <form onSubmit={submit} className="flex gap-2">
        <label className="sr-only" htmlFor="coupon">Coupon code</label>
        <input id="coupon" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Coupon code" aria-invalid={!!error} aria-describedby={error ? "coupon-error" : undefined} className="min-w-0 flex-1 rounded-full border border-black/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#758446]" />
        <button type="submit" disabled={cartBusy || !code.trim()} className="rounded-full border border-[#22231f] px-4 py-2.5 text-sm font-semibold transition hover:bg-[#22231f] hover:text-white disabled:opacity-50">Apply</button>
      </form>
      {error && <p id="coupon-error" role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <ul className="mt-2 flex flex-wrap gap-2">
        {cart?.pricing.appliedCoupons.map((c) => (
          <li key={c.code} className="inline-flex items-center gap-1.5 rounded-full bg-[#eff3e3] px-3 py-1 text-xs font-medium text-[#53652e]"><Tag size={12} aria-hidden /> {c.code} applied
            <button type="button" aria-label={`Remove coupon ${c.code}`} onClick={() => removeCoupon(c.code)}><X size={12} /></button></li>
        ))}
      </ul>
      {(cart?.coupons.available.length ?? 0) > 0 && cart!.pricing.appliedCoupons.length === 0 && (
        <p className="mt-2 text-xs text-[#77786f]">Offers: {cart!.coupons.available.slice(0, 3).map((c, i) => <button key={c.code} type="button" onClick={() => setCode(c.code)} className="mr-2 underline underline-offset-2">{c.code}{i < 2 ? "" : ""}</button>)}</p>
      )}
    </div>
  );
}

export function CartPage() {
  const { cart, cartReady, cartBusy, setLineQuantity, removeLine, refreshCart } = useShop();

  if (!cartReady) return <div className="mx-auto max-w-5xl px-5 py-16"><div className="h-64 animate-pulse rounded-xl bg-[#ebeae2]" aria-label="Loading your bag" /></div>;
  if (!cart) return (
    <div role="alert" className="mx-auto max-w-lg px-5 py-20 text-center"><p className="text-lg font-medium">We couldn&apos;t load your bag.</p><button onClick={() => void refreshCart()} className="mt-4 rounded-full bg-[#22231f] px-5 py-2.5 text-sm font-semibold text-white">Try again</button></div>
  );
  if (cart.items.length === 0) return (
    <div className="mx-auto max-w-lg px-5 py-20 text-center">
      <ShoppingBag size={40} strokeWidth={1.2} className="mx-auto text-[#77786f]" aria-hidden />
      <h1 className="mt-4 text-3xl font-medium tracking-[-0.04em]">Your bag is empty</h1>
      <p className="mt-2 text-sm text-[#717168]">Find something you&apos;ll love in our electronics range.</p>
      <Link href="/products" className="mt-6 inline-block rounded-full bg-[#22231f] px-6 py-3 text-sm font-semibold text-white hover:bg-[#44463b]">Shop electronics</Link>
    </div>
  );

  const blocked = cart.items.some((i) => !i.purchasable);
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="text-4xl font-medium tracking-[-0.06em]">Your bag<span className="text-[#87964f]">.</span></h1>
      <p className="mt-2 text-sm text-[#717168]">{cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}</p>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <ul className="space-y-4">
          {cart.items.map((line) => (
            <li key={line.id} className="flex gap-4 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
              <Link href={`/products/${line.slug}`} className="h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-[#f0efe9] sm:h-32 sm:w-32"><ProductImage src={line.image} alt={line.name} boxClassName="h-full w-full" className="p-1" /></Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0"><Link href={`/products/${line.slug}`} className="line-clamp-2 font-medium hover:underline">{line.name}</Link>{line.variantName && <p className="mt-0.5 text-xs text-[#77786f]">{line.variantName}</p>}<p className="mt-0.5 text-[11px] text-[#92938b]">SKU {line.sku}</p></div>
                  <div className="text-right"><p className="font-semibold">{money(line.lineTotal)}</p>{line.quantity > 1 && <p className="text-xs text-[#77786f]">{money(line.unitPrice)} each</p>}</div>
                </div>
                {line.priceChanged && <p role="status" className="mt-1 text-xs text-amber-700">Price changed from {money(line.priceChanged.from)} to {money(line.priceChanged.to)}</p>}
                {line.issues.filter((i) => i.code !== "PRICE_CHANGED").map((i) => <p key={i.code} role="alert" className="mt-1 text-xs text-red-700">{i.message}</p>)}
                {line.availability.status === "LOW_STOCK" && line.purchasable && <p className="mt-1 text-xs text-amber-700">Only {line.availability.available} left</p>}
                <div className="mt-auto flex items-center justify-between pt-3">
                  <div className="flex items-center gap-1 rounded-full border border-black/15 px-1 py-0.5">
                    <button type="button" disabled={cartBusy} aria-label={`Decrease quantity of ${line.name}`} onClick={() => setLineQuantity(line.id, line.quantity - 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5 disabled:opacity-40"><Minus size={14} /></button>
                    <span className="min-w-6 text-center text-sm" aria-live="polite">{line.quantity}</span>
                    <button type="button" disabled={cartBusy || line.quantity >= line.availability.maxPurchasable} aria-label={`Increase quantity of ${line.name}`} onClick={() => setLineQuantity(line.id, line.quantity + 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5 disabled:opacity-40"><Plus size={14} /></button>
                  </div>
                  <button type="button" disabled={cartBusy} onClick={() => removeLine(line.id)} className="text-sm text-[#77786f] underline underline-offset-2 hover:text-black disabled:opacity-40">Remove</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <aside className="h-fit space-y-5 rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-6" aria-label="Order summary">
          <h2 className="text-lg font-semibold">Order summary {cartBusy && <Loader2 size={14} className="ml-1 inline animate-spin" aria-label="Updating" />}</h2>
          <CouponBox />
          <PriceSummary pricing={cart.pricing} />
          {cart.pricing.freeShippingRemaining ? <p className="text-xs text-[#77786f]">Add {money(cart.pricing.freeShippingRemaining)} more for free delivery.</p> : null}
          <p className="text-xs text-[#77786f]">Delivery shown is for the default option; you choose at checkout. Final amounts are confirmed by the server when you place the order.</p>
          <Link href="/checkout" aria-disabled={blocked} className={`block rounded-full bg-[#22231f] px-5 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#44463b] ${blocked ? "pointer-events-none opacity-50" : ""}`}>Proceed to checkout</Link>
          {blocked && <p role="alert" className="text-xs text-red-700">Resolve the items marked above (remove them or lower the quantity) to continue.</p>}
          <Link href="/products" className="block text-center text-sm underline underline-offset-4">Continue shopping</Link>
        </aside>
      </div>
    </div>
  );
}
