"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Banknote, Check, CreditCard, Loader2, MapPin, Plus } from "lucide-react";
import { ProductImage } from "./product-image";
import { useShop } from "./shop-provider";
import { CouponBox, PriceSummary } from "./cart-page";
import { api, ApiError, errorMessage, newIdempotencyKey } from "@/lib/shop/api";
import { formatDateRange, money } from "@/lib/shop/format";
import type { Address, AddressInput, CheckoutResult, CheckoutValidation } from "@/lib/shop/types";

type Method = "COD" | "ONLINE";

const Steps = ({ step }: { step: 1 | 2 | 3 }) => (
  <ol className="mt-6 flex items-center gap-2 text-xs sm:gap-4" aria-label="Checkout progress">
    {["Delivery address", "Delivery & payment", "Review & place order"].map((label, i) => (
      <li key={label} aria-current={step === i + 1 ? "step" : undefined} className={`flex items-center gap-2 ${step >= i + 1 ? "font-semibold text-[#22231f]" : "text-[#92938b]"}`}>
        <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${step > i + 1 ? "bg-[#758446] text-white" : step === i + 1 ? "bg-[#22231f] text-white" : "bg-black/10"}`}>{step > i + 1 ? <Check size={12} /> : i + 1}</span>
        <span className="hidden sm:inline">{label}</span>
        {i < 2 && <span className="hidden h-px w-8 bg-black/15 sm:block" aria-hidden />}
      </li>
    ))}
  </ol>
);

function AddressForm({ onSaved, onCancel }: { onSaved: (a: Address) => void; onCancel?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body: AddressInput = { fullName: f.fullName!, phone: f.phone!, line1: f.line1!, line2: f.line2 || undefined, landmark: f.landmark || undefined, city: f.city!, state: f.state!, postalCode: f.postalCode!, country: "IN", type: (f.type as AddressInput["type"]) || "HOME", isDefault: true };
    setBusy(true); setError(null); setFieldErrors({});
    try { onSaved((await api.post<Address>("/addresses", body)).data); }
    catch (err) {
      if (err instanceof ApiError && err.details?.fields) setFieldErrors(Object.fromEntries(err.details.fields.map((x) => [x.path, x.message])));
      setError(errorMessage(err));
    } finally { setBusy(false); }
  };
  const field = (name: string, label: string, opts: { required?: boolean; type?: string; autoComplete?: string; span?: boolean } = {}) => (
    <div className={opts.span ? "sm:col-span-2" : ""}>
      <label htmlFor={`addr-${name}`} className="text-sm font-medium">{label}{opts.required === false && <span className="font-normal text-[#92938b]"> (optional)</span>}</label>
      <input id={`addr-${name}`} name={name} type={opts.type ?? "text"} required={opts.required !== false} autoComplete={opts.autoComplete} aria-invalid={!!fieldErrors[name]} aria-describedby={fieldErrors[name] ? `addr-${name}-err` : undefined} className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#758446]" />
      {fieldErrors[name] && <p id={`addr-${name}-err`} className="mt-1 text-xs text-red-700">{fieldErrors[name]}</p>}
    </div>
  );
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-xl border border-black/10 bg-white p-5 sm:grid-cols-2">
      {field("fullName", "Full name", { autoComplete: "name" })}
      {field("phone", "Mobile number", { type: "tel", autoComplete: "tel" })}
      {field("line1", "Address line 1", { autoComplete: "address-line1", span: true })}
      {field("line2", "Address line 2", { required: false, autoComplete: "address-line2", span: true })}
      {field("landmark", "Landmark", { required: false, span: true })}
      {field("city", "City", { autoComplete: "address-level2" })}
      {field("state", "State", { autoComplete: "address-level1" })}
      {field("postalCode", "PIN code", { autoComplete: "postal-code" })}
      <div><label htmlFor="addr-type" className="text-sm font-medium">Address type</label><select id="addr-type" name="type" className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3.5 py-2.5 text-sm"><option value="HOME">Home</option><option value="WORK">Work</option><option value="OTHER">Other</option></select></div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 sm:col-span-2">{error}</p>}
      <div className="flex gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-[#22231f] px-5 py-3 text-sm font-semibold text-white hover:bg-[#44463b] disabled:opacity-60">{busy && <Loader2 size={15} className="animate-spin" aria-hidden />} Save address</button>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-full border border-black/20 px-5 py-3 text-sm font-semibold">Cancel</button>}
      </div>
    </form>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user, authReady, cart, cartReady, refreshCart } = useShop();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [shippingMethod, setShippingMethod] = useState<string>("");
  const [methodChoice, setMethod] = useState<Method>("COD");
  const [problem, setProblem] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [notes, setNotes] = useState("");
  const idemKey = useRef<{ sig: string; key: string } | null>(null);
  const submitting = useRef(false);

  useEffect(() => { if (authReady && !user) router.replace("/login?next=/checkout"); }, [authReady, user, router]);

  useEffect(() => {
    if (!user) return;
    api.get<Address[]>("/addresses").then((r) => {
      setAddresses(r.data);
      setAddressId((cur) => cur || (r.data.find((a) => a.isDefault) ?? r.data[0])?.id || "");
      if (r.data.length === 0) setAdding(true);
    }).catch((e) => { setAddresses([]); setProblem(errorMessage(e)); });
  }, [user]);

  const couponSig = cart?.pricing.appliedCoupons.map((c) => c.code).join(",") ?? "";
  const cartSig = cart?.items.map((i) => `${i.variantId}:${i.quantity}`).join("|") ?? "";

  // Server validation, keyed by everything that affects totals. State is written only from async callbacks;
  // "validating" is derived (the stored result belongs to an older key), so there is no setState in the effect body.
  const [recheck, setRecheck] = useState(0);
  const validationKey = `${addressId}|${shippingMethod}|${cartSig}|${couponSig}|${recheck}`;
  const [result, setResult] = useState<{ key: string; data: CheckoutValidation | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!addressId || !cartSig) return;
    let alive = true;
    api.post<CheckoutValidation>("/checkout/validate", { addressId, shippingMethod: shippingMethod || undefined })
      .then((res) => { if (!alive) return; setResult({ key: validationKey, data: res.data, error: null }); if (!shippingMethod && res.data.shipping.selected) setShippingMethod(res.data.shipping.selected.code); })
      .catch((e) => { if (alive) setResult({ key: validationKey, data: null, error: errorMessage(e) }); });
    return () => { alive = false; };
  }, [addressId, shippingMethod, cartSig, validationKey]);
  const validation = addressId && cartSig ? result?.data ?? null : null;
  const validating = !!addressId && !!cartSig && result?.key !== validationKey;
  const validationError = result?.key === validationKey ? result.error : null;

  const codOption = validation?.paymentMethods.find((p) => p.code === "COD");
  const onlineOption = validation?.paymentMethods.find((p) => p.code === "ONLINE");
  // the storefront has no payment-gateway SDK wired yet, so online payment is offered only when it can truly complete
  const onlineUsable = false;
  const method: Method = codOption && !codOption.available ? "ONLINE" : methodChoice; // COD unavailable (e.g. very large order) → only online remains

  const total = validation?.pricing.grandTotal;
  const signature = useMemo(() => JSON.stringify([addressId, shippingMethod, method, cartSig, couponSig, total, notes]), [addressId, shippingMethod, method, cartSig, couponSig, total, notes]);

  const placeOrder = async () => {
    if (submitting.current || !validation?.valid || !addressId) return; // ref guard: a double-click can't slip between renders
    submitting.current = true; setPlacing(true); setProblem(null);
    // one idempotency key per distinct attempt: retrying/double-clicking the SAME basket can never create a second order
    if (idemKey.current?.sig !== signature) idemKey.current = { sig: signature, key: newIdempotencyKey() };
    try {
      const res = await api.post<CheckoutResult>("/checkout/create", { addressId, shippingMethod: shippingMethod || undefined, paymentMethod: method, notes: notes.trim() || undefined, expectedTotal: validation.pricing.grandTotal }, { idempotencyKey: idemKey.current.key });
      await refreshCart(); // the server clears purchased lines only once the order is confirmed
      router.replace(`/checkout/success?order=${encodeURIComponent(res.data.order.orderNumber)}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "PRICE_CHANGED") { setProblem("Prices or discounts changed while you were checking out. We've refreshed the totals below — please review and place the order again."); idemKey.current = null; await refreshCart(); setRecheck((n) => n + 1); }
      else { setProblem(errorMessage(e)); if (e instanceof ApiError && e.status >= 400 && e.status < 500) idemKey.current = null; await refreshCart(); }
      submitting.current = false; setPlacing(false);
    }
  };

  if (!authReady || !cartReady || (user && addresses === null)) return <div className="mx-auto max-w-5xl px-5 py-16"><div className="h-72 animate-pulse rounded-xl bg-[#ebeae2]" aria-label="Loading checkout" /></div>;
  if (!user) return null;
  if (!cart || cart.items.length === 0) return (
    <div className="mx-auto max-w-lg px-5 py-20 text-center"><h1 className="text-2xl font-semibold">Your bag is empty</h1><p className="mt-2 text-sm text-[#717168]">Add something to your bag before checking out.</p><Link href="/products" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#22231f] px-5 py-3 text-sm font-semibold text-white"><ArrowLeft size={16} /> Return to shopping</Link></div>
  );

  const step: 1 | 2 | 3 = !addressId ? 1 : validation?.valid ? 3 : 2;
  const items = validation?.items ?? cart.items;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <Link href="/cart" className="inline-flex items-center gap-2 text-sm text-[#62635b] hover:text-black"><ArrowLeft size={16} /> Back to bag</Link>
      <h1 className="mt-4 text-4xl font-medium tracking-[-0.06em] sm:text-5xl">Almost yours<span className="text-[#87964f]">.</span></h1>
      <Steps step={step} />

      {(problem ?? validationError) && <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{problem ?? validationError}</p>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-9">
          <section aria-labelledby="addr-h">
            <h2 id="addr-h" className="flex items-center gap-2 text-lg font-semibold"><MapPin size={18} aria-hidden /> Delivery address</h2>
            {adding ? (
              <div className="mt-4"><AddressForm onSaved={(a) => { setAddresses((cur) => [a, ...(cur ?? []).map((x) => ({ ...x, isDefault: false }))]); setAddressId(a.id); setAdding(false); }} onCancel={addresses?.length ? () => setAdding(false) : undefined} /></div>
            ) : (
              <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Choose a delivery address</legend>
                {addresses?.map((a) => (
                  <label key={a.id} className={`cursor-pointer rounded-xl border bg-white p-4 text-sm transition ${addressId === a.id ? "border-[#758446] ring-1 ring-[#758446]" : "border-black/10 hover:border-black/30"}`}>
                    <input type="radio" name="address" value={a.id} checked={addressId === a.id} onChange={() => { setAddressId(a.id); setShippingMethod(""); }} className="sr-only" />
                    <span className="flex items-center justify-between"><span className="font-semibold">{a.fullName}</span><span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] tracking-wider">{a.type}</span></span>
                    <span className="mt-1 block leading-5 text-[#62635b]">{a.line1}{a.line2 ? `, ${a.line2}` : ""}{a.landmark ? `, ${a.landmark}` : ""}<br />{a.city}, {a.state} {a.postalCode}<br />Phone {a.phone}</span>
                  </label>
                ))}
                <button type="button" onClick={() => setAdding(true)} className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-dashed border-black/25 text-sm font-medium hover:border-black/50"><Plus size={16} /> Add a new address</button>
              </fieldset>
            )}
          </section>

          {addressId && (
            <section aria-labelledby="ship-h">
              <h2 id="ship-h" className="text-lg font-semibold">Delivery method</h2>
              {!validation && validating ? <div className="mt-4 h-20 animate-pulse rounded-xl bg-[#ebeae2]" /> : validation?.shipping.options.length ? (
                <fieldset className="mt-4 space-y-3"><legend className="sr-only">Choose a delivery method</legend>
                  {validation.shipping.options.map((o) => (
                    <label key={o.code} className={`flex cursor-pointer items-center gap-4 rounded-xl border bg-white p-4 transition ${shippingMethod === o.code ? "border-[#758446] ring-1 ring-[#758446]" : "border-black/10 hover:border-black/30"}`}>
                      <input type="radio" name="shipping" value={o.code} checked={shippingMethod === o.code} onChange={() => setShippingMethod(o.code)} className="accent-[#758446]" />
                      <span className="flex-1"><span className="block text-sm font-semibold">{o.name}</span><span className="mt-0.5 block text-xs text-[#77786f]">{o.description} · arrives {formatDateRange(o.estimatedDelivery.earliest, o.estimatedDelivery.latest)}</span></span>
                      <span className="text-sm font-semibold">{o.fee === 0 || (o.freeAboveSubtotal != null && validation.pricing.subtotal >= o.freeAboveSubtotal) ? "Free" : money(o.fee)}</span>
                    </label>
                  ))}
                </fieldset>
              ) : <p className="mt-4 text-sm text-red-700">We can&apos;t deliver to this address. Choose another address.</p>}
            </section>
          )}

          {addressId && validation && (
            <section aria-labelledby="pay-h">
              <h2 id="pay-h" className="text-lg font-semibold">Payment</h2>
              <fieldset className="mt-4 space-y-3"><legend className="sr-only">Choose a payment method</legend>
                <label className={`flex items-center gap-4 rounded-xl border bg-white p-4 ${!codOption?.available ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${method === "COD" ? "border-[#758446] ring-1 ring-[#758446]" : "border-black/10"}`}>
                  <input type="radio" name="pay" checked={method === "COD"} disabled={!codOption?.available} onChange={() => setMethod("COD")} className="accent-[#758446]" />
                  <Banknote size={20} className="text-[#62635b]" aria-hidden />
                  <span className="flex-1"><span className="block text-sm font-semibold">Cash on delivery</span><span className="mt-0.5 block text-xs text-[#77786f]">{codOption?.available ? "Pay in cash when your order arrives." : codOption?.note ?? "Not available for this order."}</span></span>
                </label>
                <label className={`flex items-center gap-4 rounded-xl border bg-white p-4 ${onlineUsable ? "cursor-pointer" : "cursor-not-allowed opacity-60"} border-black/10`}>
                  <input type="radio" name="pay" checked={method === "ONLINE"} disabled={!onlineUsable} onChange={() => setMethod("ONLINE")} className="accent-[#758446]" />
                  <CreditCard size={20} className="text-[#62635b]" aria-hidden />
                  <span className="flex-1"><span className="block text-sm font-semibold">UPI / Card / Net banking</span><span className="mt-0.5 block text-xs text-[#77786f]">Not available yet — online payments go live once the payment gateway{onlineOption?.provider ? ` (${onlineOption.provider})` : ""} credentials are connected.</span></span>
                </label>
              </fieldset>
              <div className="mt-5"><label htmlFor="notes" className="text-sm font-medium">Delivery notes <span className="font-normal text-[#92938b]">(optional)</span></label><textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} rows={2} className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#758446]" /></div>
            </section>
          )}
        </div>

        <aside className="h-fit space-y-5 rounded-xl border border-black/10 bg-white p-5 shadow-sm sm:p-6" aria-label="Order summary">
          <h2 className="text-lg font-semibold">Order summary {validating && <Loader2 size={14} className="ml-1 inline animate-spin" aria-label="Updating totals" />}</h2>
          <ul className="divide-y divide-black/10">
            {items.map((i) => (
              <li key={i.variantId} className="flex gap-3 py-3 first:pt-0">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-[#f0efe9]"><ProductImage src={i.image} alt={i.name} boxClassName="h-full w-full" className="p-1" width={64} height={64} /></div>
                <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-medium">{i.name}</p>{i.variantName && <p className="text-xs text-[#77786f]">{i.variantName}</p>}<p className="mt-0.5 text-xs text-[#77786f]">Qty {i.quantity}</p>{i.issues.filter((x) => x.code !== "PRICE_CHANGED").map((x) => <p key={x.code} role="alert" className="text-xs text-red-700">{x.message}</p>)}</div>
                <p className="shrink-0 text-sm font-semibold">{money(i.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <CouponBox />
          {validation ? <PriceSummary pricing={validation.pricing} /> : <PriceSummary pricing={cart.pricing} />}
          {validation?.coupons.rejected.map((r) => <p key={r.code} role="alert" className="text-xs text-red-700">{r.code}: {r.message}</p>)}
          <button type="button" onClick={placeOrder} disabled={placing || validating || !validation?.valid || !addressId || (method === "ONLINE" && !onlineUsable)} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#22231f] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#44463b] disabled:cursor-not-allowed disabled:opacity-50">
            {placing && <Loader2 size={16} className="animate-spin" aria-hidden />}{placing ? "Placing your order…" : validation ? `Place order · ${money(validation.pricing.grandTotal)}` : "Place order"}
          </button>
          <p className="text-center text-xs text-[#77786f]">Totals are calculated and re-checked by the server when you place the order.{validation ? ` Items are held for ${validation.reservationMinutes} minutes once an order is created.` : ""}</p>
        </aside>
      </div>
    </div>
  );
}
