"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, CheckCircle2, CreditCard, Printer, Smartphone, X } from "lucide-react";
import { CHECKOUT_STORAGE_KEY, isCheckoutItem, type CheckoutItem } from "./checkout-data";

type PaymentMethod = "upi" | "cash" | "card";
type Order = {
  number: string;
  invoiceNumber: string;
  placedAt: Date;
  paymentMethod: PaymentMethod;
};

const paymentOptions: { id: PaymentMethod; label: string; detail: string; icon: typeof Smartphone }[] = [
  { id: "upi", label: "UPI", detail: "Pay using a UPI app", icon: Smartphone },
  { id: "cash", label: "Cash on delivery", detail: "Pay when your order arrives", icon: Banknote },
  { id: "card", label: "Card", detail: "Credit or debit card", icon: CreditCard },
];

const money = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
}).format(amount);

export default function CheckoutPage() {
  const [items, setItems] = useState<CheckoutItem[]>([]);
  const [loadError, setLoadError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [order, setOrder] = useState<Order | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const serialized = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
        if (!serialized) return;
        const payload: unknown = JSON.parse(serialized);
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("items" in payload) ||
          !Array.isArray(payload.items) ||
          payload.items.length === 0 ||
          !payload.items.every(isCheckoutItem)
        ) {
          throw new Error("The saved checkout cart is invalid");
        }
        setItems(payload.items);
      } catch (error) {
        console.error("Failed to load checkout cart", error);
        setLoadError("We couldn't load your shopping bag. Please return to the store and try again.");
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!invoiceOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInvoiceOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [invoiceOpen]);

  const placeOrder = () => {
    if (!items.length || order) return;

    const reference = Date.now().toString(36).toUpperCase();
    setOrder({
      number: `GT-${reference}`,
      invoiceNumber: `INV-${reference}`,
      placedAt: new Date(),
      paymentMethod,
    });
    setInvoiceOpen(true);
    try {
      sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear completed checkout cart", error);
    }
  };

  if (loadError || items.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf9f6] px-5 text-[#20211e]">
        <section className="w-full max-w-lg rounded-xl border border-black/10 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">{loadError ? "Checkout unavailable" : "Your bag is empty"}</h1>
          <p className="mt-3 text-sm leading-6 text-[#717168]">{loadError || "Add something to your bag before checking out."}</p>
          <Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#22231f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#44463b]">
            <ArrowLeft size={16} /> Return to shopping
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf9f6] px-5 py-8 text-[#20211e] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl print:hidden">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#62635b] transition hover:text-black">
          <ArrowLeft size={16} /> Continue shopping
        </Link>
        <header className="mt-8 border-b border-black/10 pb-6">
          <p className="text-[10px] tracking-[0.2em] text-[#77786f]">GLOTRON CHECKOUT</p>
          <h1 className="mt-2 text-4xl font-medium tracking-[-0.06em] sm:text-5xl">Almost yours<span className="text-[#87964f]">.</span></h1>
        </header>

        {order && (
          <section role="status" className="mt-6 flex items-start gap-3 rounded-xl border border-[#80934b]/30 bg-[#eff3e3] p-4">
            <CheckCircle2 size={21} className="mt-0.5 shrink-0 text-[#53652e]" />
            <div>
              <h2 className="font-semibold">Order placed successfully!</h2>
              <p className="mt-1 text-sm text-[#62635b]">Order {order.number} is confirmed. Your invoice is ready.</p>
              <button type="button" onClick={() => setInvoiceOpen(true)} className="mt-2 text-sm font-semibold underline underline-offset-4">View invoice</button>
            </div>
          </section>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_0.8fr]">
          <section>
            <fieldset disabled={!!order}>
              <legend className="text-lg font-semibold">Choose a payment method</legend>
              <div className="mt-4 space-y-3">
                {paymentOptions.map(({ id, label, detail, icon: Icon }) => (
                  <label key={id} className={`flex cursor-pointer items-center gap-4 rounded-xl border bg-white p-4 transition ${paymentMethod === id ? "border-[#758446] ring-1 ring-[#758446]" : "border-black/10 hover:border-black/30"} ${order ? "cursor-not-allowed opacity-70" : ""}`}>
                    <input type="radio" name="payment-method" value={id} checked={paymentMethod === id} onChange={() => setPaymentMethod(id)} className="accent-[#758446]" />
                    <Icon size={20} className="shrink-0 text-[#62635b]" />
                    <span className="flex-1">
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="mt-1 block text-xs text-[#77786f]">{detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="mt-4 text-xs leading-5 text-[#77786f]">This storefront checkout is a demo. Selecting a method confirms the order here; it does not process a real payment.</p>
          </section>

          <section className="h-fit rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold">Order summary</h2>
            <div className="mt-5 divide-y divide-black/10">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                  <img src={item.image} alt="" className="h-16 w-16 shrink-0 rounded-md bg-[#f0efe9] object-contain p-2" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{item.name}</p>
                    <p className="mt-1 text-xs text-[#77786f]">Quantity: {item.quantity}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{money(item.unitPrice * item.quantity)}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-black/10 pt-4 text-sm">
              <span className="font-semibold">Total</span>
              <span className="text-lg font-semibold">{money(total)}</span>
            </div>
            <button type="button" onClick={placeOrder} disabled={!!order} className="mt-5 w-full rounded-full bg-[#22231f] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#44463b] disabled:cursor-not-allowed disabled:opacity-60">
              {order ? "Order placed" : "Buy"}
            </button>
          </section>
        </div>
      </div>

      {invoiceOpen && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:fixed print:inset-0 print:bg-white print:p-0" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setInvoiceOpen(false);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="invoice-heading" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 text-[#20211e] shadow-2xl sm:p-8 print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] tracking-[0.2em] text-[#77786f]">GLOTRON</p>
                <h2 id="invoice-heading" className="mt-2 text-2xl font-semibold">Order invoice</h2>
              </div>
              <button type="button" aria-label="Close invoice" onClick={() => setInvoiceOpen(false)} className="rounded-full p-2 transition hover:bg-black/5 print:hidden"><X size={20} /></button>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 border-y border-black/10 py-4 text-sm">
              <div><p className="text-xs text-[#77786f]">Invoice number</p><p className="mt-1 font-medium">{order.invoiceNumber}</p></div>
              <div><p className="text-xs text-[#77786f]">Order number</p><p className="mt-1 font-medium">{order.number}</p></div>
              <div><p className="text-xs text-[#77786f]">Date</p><p className="mt-1 font-medium">{order.placedAt.toLocaleDateString("en-IN")}</p></div>
              <div><p className="text-xs text-[#77786f]">Payment method</p><p className="mt-1 font-medium">{paymentOptions.find((option) => option.id === order.paymentMethod)?.label}</p></div>
            </div>
            <div className="mt-5">
              <div className="flex justify-between pb-2 text-xs font-semibold text-[#77786f]"><span>ITEM</span><span>AMOUNT</span></div>
              {items.map((item) => (
                <div key={item.id} className="flex justify-between gap-4 border-t border-black/10 py-3 text-sm">
                  <span>{item.name} × {item.quantity}</span><span className="shrink-0">{money(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-black/10 pt-4 font-semibold"><span>Order total</span><span>{money(total)}</span></div>
            </div>
            <button type="button" onClick={() => window.print()} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#22231f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#44463b] print:hidden">
              <Printer size={16} /> Print invoice
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
