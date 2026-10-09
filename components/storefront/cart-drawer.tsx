"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useShop } from "./shop-provider";
import { ProductImage } from "./product-image";
import { money } from "@/lib/shop/format";

/** Slide-over shopping bag. Pure view of the server cart: every number comes from `cart.pricing`. */
export function CartDrawer() {
  const { cart, cartOpen, closeCart, cartBusy, setLineQuantity, removeLine } = useShop();
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!cartOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeCart(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cartOpen, closeCart]);

  const items = cart?.items ?? [];
  const blocked = items.some((i) => !i.purchasable);

  return (
    <AnimatePresence>
      {cartOpen && (
        <>
          <motion.button type="button" aria-label="Close shopping bag" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeCart} className="fixed inset-0 z-[60] bg-black/40" />
          <motion.aside
            role="dialog" aria-modal="true" aria-labelledby="shopping-bag-heading"
            initial={reduce ? { opacity: 0 } : { x: "100%" }} animate={reduce ? { opacity: 1 } : { x: 0 }} exit={reduce ? { opacity: 0 } : { x: "100%" }} transition={{ type: "tween", duration: reduce ? 0 : 0.25 }}
            className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-md flex-col bg-[#faf9f6] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-black/10 px-6 py-5">
              <div>
                <h2 id="shopping-bag-heading" className="text-xl font-semibold">Your shopping bag</h2>
                <p className="mt-1 text-sm text-[#717168]">{cart?.itemCount ?? 0} {(cart?.itemCount ?? 0) === 1 ? "item" : "items"}</p>
              </div>
              <button ref={closeRef} type="button" aria-label="Close shopping bag" onClick={closeCart} className="rounded-full p-2 transition hover:bg-black/5"><X size={20} /></button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <ShoppingBag size={32} strokeWidth={1.4} className="text-[#77786f]" />
                <p className="mt-4 text-lg font-medium">Your bag is empty</p>
                <p className="mt-2 text-sm text-[#717168]">Add an item to see it here.</p>
                <Link href="/products" onClick={closeCart} className="mt-5 rounded-full bg-[#22231f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#44463b]">Browse electronics</Link>
              </div>
            ) : (
              <>
                <ul className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                  {items.map((line) => (
                    <li key={line.id} className="flex gap-4 rounded-lg border border-black/10 bg-white p-3 shadow-sm">
                      <Link href={`/products/${line.slug}`} onClick={closeCart} className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-[#f0efe9]">
                        <ProductImage src={line.image} alt={line.name} boxClassName="h-full w-full" className="p-2" />
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <Link href={`/products/${line.slug}`} onClick={closeCart} className="line-clamp-2 text-sm font-medium hover:underline">{line.name}</Link>
                        {line.variantName && <p className="mt-0.5 line-clamp-1 text-xs text-[#77786f]">{line.variantName}</p>}
                        <p className="mt-1 text-sm font-semibold">{money(line.lineTotal)}</p>
                        {line.issues.filter((i) => i.code !== "PRICE_CHANGED").map((i) => <p key={i.code} role="alert" className="mt-1 text-xs text-red-700">{i.message}</p>)}
                        <div className="mt-auto flex items-center justify-between pt-2">
                          <div className="flex items-center gap-1 rounded-full border border-black/10 px-1 py-0.5">
                            <button type="button" disabled={cartBusy} aria-label={`Decrease quantity of ${line.name}`} onClick={() => setLineQuantity(line.id, line.quantity - 1)} className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-black/5 disabled:opacity-40"><Minus size={14} /></button>
                            <span className="min-w-5 text-center text-xs" aria-live="polite">{line.quantity}</span>
                            <button type="button" disabled={cartBusy || line.quantity >= line.availability.maxPurchasable} aria-label={`Increase quantity of ${line.name}`} onClick={() => setLineQuantity(line.id, line.quantity + 1)} className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-black/5 disabled:opacity-40"><Plus size={14} /></button>
                          </div>
                          <button type="button" disabled={cartBusy} onClick={() => removeLine(line.id)} className="text-xs text-[#77786f] underline underline-offset-2 hover:text-black disabled:opacity-40">Remove</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="space-y-3 border-t border-black/10 bg-white px-6 py-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#717168]">Subtotal</span>
                    <span className="flex items-center gap-2 font-semibold">{cartBusy && <Loader2 size={14} className="animate-spin text-[#77786f]" aria-label="Updating" />}{money(cart!.pricing.subtotal)}</span>
                  </div>
                  {cart!.pricing.mrpSavings > 0 && <p className="text-xs text-[#53652e]">You save {money(cart!.pricing.mrpSavings)} on this bag</p>}
                  <p className="text-xs text-[#77786f]">Delivery and any coupon are shown at checkout. {cart!.pricesIncludeTax ? "Prices include tax." : ""}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Link href="/cart" onClick={closeCart} className="rounded-full border border-black/20 px-3 py-3.5 text-center text-sm font-semibold transition hover:border-black/50">View bag</Link>
                    <Link href="/checkout" onClick={closeCart} aria-disabled={blocked} className={`rounded-full bg-[#22231f] px-3 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#44463b] ${blocked ? "pointer-events-none opacity-50" : ""}`}>Checkout</Link>
                  </div>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
