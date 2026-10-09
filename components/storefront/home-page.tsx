"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Sparkles, Tag, X } from "lucide-react";
import NewArrivalsCarousel from "./NewArrivalsCarousel/NewArrivalsCarousel";
import ProductDNASection from "./ProductDNASection";
import { ProductGridCard, ProductGridSkeleton } from "./product-grid-card";
import { SafeImg } from "./product-image";
import { useShop } from "./shop-provider";
import { api } from "@/lib/shop/api";
import { leafCategories, useApi, useCategories } from "@/lib/shop/hooks";
import { money } from "@/lib/shop/format";
import type { ListingMeta, ProductCard, ProductDetail } from "@/lib/shop/types";

const photo = (id: string, width = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;

const CATEGORY_BLURB: Record<string, string> = {
  smartphones: "Explore smartphones and flagships", tablets: "Versatile screens for anywhere", laptops: "Portable computers for work and play",
  "gaming-laptops": "Performance laptops for gaming", audio: "Headphones, earbuds, and speakers", wearables: "Smartwatches and fitness trackers",
  monitors: "Displays for work, gaming, and creation", components: "Processors, storage, and graphics", "gaming-gear": "Keyboards, mice, and gaming accessories",
  cameras: "Cameras and photography equipment", networking: "Routers, chargers, and connectivity",
};

export default function HomePage() {
  const router = useRouter();
  const { addToCart, wishlist, toggleWishlist } = useShop();
  const categories = leafCategories(useCategories()).filter((c) => (c.productCount ?? 1) > 0);
  const newest = useApi<ProductCard[], ListingMeta>("/products", { sort: "newest", pageSize: 12, facets: false });
  const featured = useApi<ProductCard[], ListingMeta>("/products", { featured: true, pageSize: 8, facets: false });
  const offers = useApi<{ code: string; description: string | null; minSubtotal: number }[], unknown>("/coupons/available");
  const [dna, setDna] = useState<ProductDetail | null>(null);
  const [dnaStatus, setDnaStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [globotOpen, setGlobotOpen] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const pauseUntil = useRef(0);

  // "Product DNA" showcases a real laptop from the catalogue, loaded by slug from its own detail record
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await api.get<ProductCard[], ListingMeta>("/products", { category: "laptops", pageSize: 1, facets: false });
        const slug = list.data[0]?.slug;
        if (!slug) { if (alive) setDnaStatus("loaded"); return; }
        const detail = await api.get<ProductDetail>(`/products/${slug}`);
        if (alive) { setDna(detail.data); setDnaStatus("loaded"); }
      } catch { if (alive) setDnaStatus("error"); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const track = sliderRef.current;
    if (!track || categories.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    const observer = new IntersectionObserver(([e]) => { visible = e!.isIntersecting; }, { threshold: 0.2 });
    observer.observe(track);
    const id = window.setInterval(() => {
      if (!visible || document.visibilityState !== "visible" || track.matches(":hover") || track.contains(document.activeElement) || Date.now() < pauseUntil.current) return;
      const card = track.querySelector<HTMLElement>(".category-card");
      if (!card) return;
      const step = card.offsetWidth + (Number.parseFloat(getComputedStyle(track).columnGap) || 0);
      const max = track.scrollWidth - track.clientWidth;
      if (max <= 0) return;
      const next = track.scrollLeft + step;
      track.scrollTo({ left: next >= max - 2 ? 0 : next, behavior: "smooth" });
    }, 4200);
    return () => { window.clearInterval(id); observer.disconnect(); };
  }, [categories.length]);

  const scrollCategories = (dir: -1 | 1) => {
    pauseUntil.current = Date.now() + 7000;
    const track = sliderRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>(".category-card");
    const step = card ? card.offsetWidth + (Number.parseFloat(getComputedStyle(track).columnGap) || 0) : track.clientWidth * 0.75;
    track.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const onAdd = (p: ProductCard) => { if (p.defaultVariantId) void addToCart(p.defaultVariantId, 1, p.name); };
  const onBuyNow = async (p: ProductCard) => { if (p.defaultVariantId && (await addToCart(p.defaultVariantId, 1, p.name))) router.push("/checkout"); };
  const newArrivals = useMemo(() => newest.data ?? [], [newest.data]);

  return (
    <>
      <section aria-label="Special offers" className="relative isolate min-h-[390px] overflow-hidden bg-[#22231f] text-white sm:min-h-[340px]">
        <div className="pointer-events-none absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full border border-[#d6ed79]/20 sm:right-[27%] sm:-top-48 sm:h-[34rem] sm:w-[34rem]" />
        <div className="pointer-events-none absolute -right-10 -top-12 -z-10 h-48 w-48 rounded-full border border-[#d6ed79]/15 sm:right-[33%] sm:-top-32 sm:h-72 sm:w-72" />
        <div className="absolute inset-x-0 top-0 h-[48%] overflow-hidden sm:inset-y-0 sm:left-auto sm:right-0 sm:h-auto sm:w-[58%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo("photo-1496181133206-80ce9b88a853", 1400)} alt="A laptop on a desk" width={1400} height={933} fetchPriority="high" className="h-full w-full object-cover object-center opacity-65 sm:opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#22231f]/15 via-[#22231f]/30 to-[#22231f] sm:bg-gradient-to-r sm:from-[#22231f] sm:via-[#22231f]/20 sm:to-transparent" />
          <div className="absolute inset-0 hidden border-l-[3px] border-[#d6ed79]/70 sm:block [clip-path:ellipse(94%_130%_at_100%_50%)]" />
        </div>
        <div className="relative mx-auto flex min-h-[390px] max-w-[1440px] items-end px-5 pb-8 pt-[190px] sm:min-h-[340px] sm:items-center sm:px-8 sm:py-12 lg:px-12">
          <div className="max-w-xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#d6ed79]/40 bg-[#d6ed79]/10 px-3 py-1.5 text-[9px] font-semibold tracking-[0.16em] text-[#d6ed79] backdrop-blur-sm sm:text-[10px]"><Sparkles size={12} aria-hidden /> THE HI-FI TECH EDIT</p>
            <h2 className="text-3xl font-semibold leading-tight tracking-[-0.06em] sm:text-4xl lg:text-5xl">A brighter deal<br className="hidden sm:block" /> on better tech.</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-white/70 sm:text-base">Explore special prices across smartphones, laptops, audio and more.</p>
            <Link href="/products?sort=discount" className="mt-5 inline-flex items-center gap-3 rounded-full bg-[#d6ed79] px-5 py-3 text-sm font-semibold text-[#22231f] shadow-[0_8px_30px_rgba(214,237,121,0.2)] transition hover:translate-y-[-2px] hover:bg-[#e3f89a]">Shop offers <ArrowRight size={16} aria-hidden /></Link>
          </div>
        </div>
      </section>

      <NewArrivalsCarousel
        products={newArrivals}
        status={newest.loading ? "loading" : newest.error ? "error" : "loaded"}
        wishlist={wishlist}
        onAddToCart={onAdd}
        onBuyNow={onBuyNow}
        onToggleWishlist={(id) => toggleWishlist(id, newArrivals.find((p) => p.id === id)?.name)}
      />

      <ProductDNASection product={dna} status={dnaStatus} />

      <section id="categories" className="mx-auto max-w-[1440px] scroll-mt-24 px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
        <div className="mb-7 flex items-end justify-between gap-4 sm:mb-10">
          <div><p className="mb-3 text-[10px] tracking-[0.2em] text-[#7a7b70]">A GOOD PLACE TO START</p><h2 className="text-3xl font-medium tracking-[-0.06em] sm:text-5xl">Explore your interests<span className="text-[#87964f]">.</span></h2></div>
          <span className="hidden pb-1 text-xs text-[#77786f] sm:block">Considered picks, all in one place.</span>
        </div>
        <div className="category-slider-shell">
          <div ref={sliderRef} className="category-slider-track" onPointerDown={() => { pauseUntil.current = Date.now() + 7000; }} onFocusCapture={() => { pauseUntil.current = Date.now() + 7000; }}>
            {categories.length === 0 && [0, 1, 2, 3].map((i) => <div key={i} className="category-card animate-pulse bg-[#e7e4dc]" aria-hidden />)}
            {categories.map((c, i) => (
              <motion.div key={c.slug} whileHover={{ y: -5 }} className="category-card group relative overflow-hidden rounded-[4px] bg-[#e7e4dc] text-left">
                <Link href={`/products?category=${c.slug}`} aria-label={`Shop ${c.name}`} className="absolute inset-0 block">
                  <SafeImg src={c.imageUrl} alt="" category={c.slug} width={600} height={600} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-black/10 transition-colors group-hover:from-black/75" />
                  <span className="absolute left-4 top-4 text-[10px] tracking-[0.15em] text-white/80">{String(i + 1).padStart(2, "0")} / {String(categories.length).padStart(2, "0")}</span>
                  <div className="absolute inset-x-4 bottom-4 text-white sm:inset-x-5 sm:bottom-5">
                    <div className="flex items-center justify-between"><h3 className="text-xl font-medium tracking-[-0.04em] sm:text-2xl">{c.name}</h3><ArrowUpRight size={19} aria-hidden className="transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" /></div>
                    <p className="mt-1 text-[11px] text-white/75">{CATEGORY_BLURB[c.slug] ?? c.description}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
        {categories.length > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" aria-label="Previous categories" onClick={() => scrollCategories(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 transition hover:border-black/40"><ArrowRight size={15} className="rotate-180" /></button>
            <span className="text-xs text-[#77786f]">Swipe to explore categories</span>
            <button type="button" aria-label="Next categories" onClick={() => scrollCategories(1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 transition hover:border-black/40"><ArrowRight size={15} /></button>
          </div>
        )}
      </section>

      <section id="edit" className="scroll-mt-24 bg-[#f0efe9] py-14 sm:py-20">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div><p className="mb-3 text-[10px] tracking-[0.2em] text-[#7a7b70]">THE GOOD STUFF, RIGHT NOW</p><h2 className="text-4xl font-medium tracking-[-0.065em] sm:text-6xl">The considered edit<span className="text-[#87964f]">.</span></h2><p className="mt-3 text-sm text-[#717168]">Featured electronics, picked by our team.</p></div>
            <Link href="/products" className="inline-flex items-center gap-2 self-start rounded-full border border-black/20 bg-[#faf9f6] px-5 py-3 text-sm font-semibold transition hover:border-black/50 sm:self-auto">Shop all electronics <ArrowRight size={15} aria-hidden /></Link>
          </div>
          <div className="mt-9">
            {featured.loading ? <ProductGridSkeleton count={4} /> : featured.error && !featured.data ? (
              <p role="alert" className="text-sm text-[#717168]">Featured products are unavailable right now. <button className="underline" onClick={featured.reload}>Try again</button></p>
            ) : !featured.data?.length ? <p className="text-sm text-[#717168]">Nothing is featured at the moment — <Link className="underline" href="/products">browse everything</Link>.</p> : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4">{featured.data.map((p) => <ProductGridCard key={p.id} product={p} />)}</div>
            )}
          </div>
        </div>
      </section>

      {offers.data && offers.data.length > 0 && (
        <section aria-labelledby="offers-h" className="mx-4 mt-8 overflow-hidden rounded-[4px] bg-[#dce6bd] px-6 py-12 sm:mx-8 sm:px-12 sm:py-16 lg:mx-12 lg:px-20">
          <div className="mx-auto max-w-6xl">
            <p className="mb-3 text-[10px] tracking-[0.2em] text-[#626c49]">OFFERS RIGHT NOW</p>
            <h2 id="offers-h" className="max-w-xl text-4xl font-medium tracking-[-0.065em] sm:text-5xl">Good finds.<br />Better prices.</h2>
            <ul className="mt-8 grid gap-3 md:grid-cols-3">{offers.data.slice(0, 3).map((o) => (
              <li key={o.code} className="rounded-lg bg-[#faf9f6]/80 p-4"><p className="inline-flex items-center gap-2 font-mono text-sm font-semibold"><Tag size={14} aria-hidden /> {o.code}</p><p className="mt-1 text-sm text-[#52534b]">{o.description}</p>{o.minSubtotal > 0 && <p className="mt-1 text-xs text-[#77786f]">On orders above {money(o.minSubtotal)}</p>}</li>
            ))}</ul>
            <p className="mt-4 text-xs text-[#616650]">Apply a code in your bag or at checkout — eligibility is checked by the server.</p>
          </div>
        </section>
      )}

      <section id="story" className="mx-auto grid max-w-[1440px] scroll-mt-24 gap-8 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:items-center lg:gap-20 lg:px-12 lg:py-28">
        <div className="relative min-h-[350px] overflow-hidden rounded-[4px] bg-[#e7e3d9] sm:min-h-[510px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo("photo-1518770660439-4636190af475", 1100)} alt="The detailed circuitry inside modern electronics" width={1100} height={733} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 hover:scale-[1.035]" />
          <div className="absolute bottom-4 left-4 bg-[#faf9f6]/90 px-4 py-3 text-[10px] tracking-[0.1em] text-[#45463e]">LESS, BUT BETTER TECH.</div>
        </div>
        <div className="lg:py-10">
          <p className="mb-5 text-[10px] tracking-[0.2em] text-[#7a7b70]">A LITTLE MORE INTENTIONAL</p>
          <h2 className="max-w-xl text-5xl font-medium leading-[0.98] tracking-[-0.075em] sm:text-7xl">Not more tech.<br /><span className="font-serif italic font-normal text-[#758446]">Better tech.</span></h2>
          <p className="mt-7 max-w-lg text-sm leading-7 text-[#6d6e64] sm:text-base sm:leading-8">Find electronics that fit your life, not another spec sheet to sort through. We bring useful design, considered details and everyday tech into one calmer place.</p>
          <Link href="/products" className="group mt-8 inline-flex items-center gap-4 border-b border-[#8a8b80] pb-3 text-xs font-medium">Get to know the edit <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden /></Link>
          <div className="mt-12 grid max-w-lg grid-cols-3 gap-4 border-t border-black/10 pt-6">{["Useful by design", "Quality over noise", "Made for real life"].map((t, i) => <div key={t}><p className="text-xl font-medium tracking-tight sm:text-2xl">0{i + 1}.</p><p className="mt-2 text-[10px] leading-4 text-[#77786f] sm:text-xs">{t}</p></div>)}</div>
        </div>
      </section>

      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end sm:bottom-6 sm:right-6">
        <AnimatePresence>
          {globotOpen && (
            <motion.section role="dialog" aria-label="HI-FI shortcuts" initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.96 }} className="mb-4 w-[min(350px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/10 bg-[#faf9f6] shadow-[0_24px_70px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between bg-[#22231f] px-4 py-3.5 text-white">
                <span><span className="block text-sm font-semibold">HI-FI shortcuts</span><span className="mt-0.5 block text-[10px] text-white/60">Jump straight to what you need</span></span>
                <button type="button" aria-label="Close shortcuts" onClick={() => setGlobotOpen(false)} className="rounded-full p-2 transition hover:bg-white/10"><X size={17} /></button>
              </div>
              <ul className="space-y-2 p-4 text-sm">
                {[["Browse all electronics", "/products"], ["Find a deal", "/products?sort=discount"], ["See what's new", "/products?sort=newest"], ["Track my order", "/account/orders"]].map(([label, href]) => (
                  <li key={href}><Link href={href!} onClick={() => setGlobotOpen(false)} className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-3.5 py-3 transition hover:border-[#758446]">{label}<ArrowUpRight size={15} aria-hidden /></Link></li>
                ))}
                <li className="pt-1 text-[10px] leading-4 text-[#92938b]">Quick links only — live chat isn&apos;t available yet.</li>
              </ul>
            </motion.section>
          )}
        </AnimatePresence>
        <button type="button" aria-label={globotOpen ? "Close shortcuts" : "Open shortcuts"} aria-expanded={globotOpen} onClick={() => setGlobotOpen((o) => !o)}
          className={`group relative flex h-[70px] w-[62px] items-end justify-center rounded-[23px] bg-gradient-to-br from-[#d6ed79] via-[#b6d05e] to-[#758446] pb-1.5 shadow-[0_10px_26px_rgba(58,73,27,0.34)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#758446] sm:h-[80px] sm:w-[70px] ${globotOpen ? "" : "globot-jump"}`}>
          <span aria-hidden="true" className="absolute -top-1.5 left-1/2 h-3 w-1 -translate-x-1/2 rounded-full bg-[#d6ed79] shadow-[0_0_10px_#d6ed79]"><span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#f5ffb5] shadow-[0_0_12px_#d6ed79]" /></span>
          <span aria-hidden="true" className="absolute top-[12px] flex h-[34px] w-[44px] items-center justify-center gap-1.5 rounded-[14px] border border-white/70 bg-gradient-to-br from-white via-[#eef3d9] to-[#aebd83] shadow-[inset_0_3px_5px_white,inset_0_-5px_8px_rgba(58,73,27,0.24),0_6px_10px_rgba(34,35,31,0.2)] sm:top-[14px] sm:h-[38px] sm:w-[50px]">
            <span className="h-2 w-2 rounded-full bg-[#22231f] shadow-[0_0_0_2px_rgba(214,237,121,0.85),0_0_8px_#758446] sm:h-2.5 sm:w-2.5" />
            <span className="h-2 w-2 rounded-full bg-[#22231f] shadow-[0_0_0_2px_rgba(214,237,121,0.85),0_0_8px_#758446] sm:h-2.5 sm:w-2.5" />
          </span>
          <span aria-hidden="true" className="absolute bottom-[7px] h-[20px] w-[32px] rounded-t-[10px] rounded-b-[7px] border border-white/40 bg-gradient-to-b from-[#454936] to-[#22231f] sm:bottom-[8px] sm:h-[23px] sm:w-[36px]" />
        </button>
      </div>
    </>
  );
}
