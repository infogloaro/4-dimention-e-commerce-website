"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Heart, Menu,
  Search, ShoppingBag, Sparkles, X, Zap,
} from "lucide-react";

type StoreProduct = {
  id: number | string;
  name: string;
  category: string;
  price: number;
  old: number;
  rating: string;
  tag: string;
  image: string;
  tone: string;
};
const products: StoreProduct[] = [
  { id: 1, name: "Studio Wireless Headphones", category: "Audio", price: 8999, old: 11999, rating: "4.9", tag: "BESTSELLER", image: "photo-1505740420928-5e560c06d30e", tone: "bg-[#e9e5df]" },
  { id: 2, name: "Voltix Aero 14 OLED Ultrabook", category: "Laptops", price: 94990, old: 109990, rating: "4.9", tag: "JUST DROPPED", image: "photo-1496181133206-80ce9b88a853", tone: "bg-[#e5e8df]" },
  { id: 3, name: "Minimal High-Fi Wireless Speaker", category: "Audio", price: 6499, old: 7999, rating: "4.7", tag: "STAFF PICK", image: "photo-1608043152269-423dbba4e7e1", tone: "bg-[#e8e1d9]" },
  { id: 4, name: "Kora Pulse AMOLED Smartwatch", category: "Wearables", price: 12999, old: 16999, rating: "4.8", tag: "LIMITED", image: "photo-1523275335684-37898b6baf30", tone: "bg-[#e5e3dc]" },
  { id: 5, name: "Horizon 32\" 4K OLED Pro Display", category: "Monitors", price: 89999, old: 109999, rating: "4.9", tag: "CREATOR PICK", image: "photo-1527443224154-c4a3942d3acf", tone: "bg-[#e8e4df]" },
  { id: 6, name: "Quantum Pro Mechanical Keyboard", category: "Gaming", price: 8999, old: 11999, rating: "4.8", tag: "TRENDING", image: "photo-1587829741301-dc798b83add3", tone: "bg-[#e9e3df]" },
];

const categories = [
  { name: "All finds", number: "01", detail: "Complete electronics catalog", image: "photo-1550009158-9ebf69173e03" },
  { name: "Smartphones", number: "02", detail: "Flagship 5G & creator handsets", image: "photo-1511707171634-5f897ff02aa9" },
  { name: "Laptops", number: "03", detail: "OLED ultrabooks & workstations", image: "photo-1496181133206-80ce9b88a853" },
  { name: "Audio", number: "04", detail: "Studio ANC headphones & hi-fi sound", image: "photo-1505740420928-5e560c06d30e" },
];

const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

const photo = (id: string, width = 900) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;

export default function HomePage() {
  const [category, setCategory] = useState("All finds");
  const [query, setQuery] = useState("");
  const [wishlist, setWishlist] = useState<(number | string)[]>([]);
  const [cart, setCart] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [liveProducts, setLiveProducts] = useState<StoreProduct[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/products?facets=false")
      .then(async (response) => {
        if (!response.ok) throw new Error("Product request failed");
        return response.json();
      })
      .then((payload) => {
        const items = Array.isArray(payload?.data) ? payload.data : [];
        if (!active || items.length === 0) return;
        type ApiProduct = {
          id: string;
          name?: string;
          category?: string | { name?: string; slug?: string };
          price?: { price?: number; min?: number; compareAtPrice?: number | null };
          rating?: { average?: number };
          badges?: { label?: string }[];
          isFeatured?: boolean;
          image?: { url?: string | null; thumbnailUrl?: string | null } | null;
        };
        const mapped: StoreProduct[] = (items as ApiProduct[]).map((item) => {
          const amount = Number(item.price?.price ?? item.price?.min ?? 0) / 100;
          const compareAt = Number(item.price?.compareAtPrice ?? 0) / 100;
          const categoryName = typeof item.category === "string"
            ? item.category
            : item.category?.name ?? item.category?.slug ?? "Discover";
          return {
            id: item.id,
            name: item.name ?? "Untitled product",
            category: categoryName,
            price: amount,
            old: compareAt > amount ? compareAt : amount,
            rating: Number(item.rating?.average ?? 0).toFixed(1),
            tag: item.badges?.[0]?.label?.toUpperCase() ?? (item.isFeatured ? "FEATURED" : "CURATED"),
            image: item.image?.url ?? item.image?.thumbnailUrl ?? "photo-1505740420928-5e560c06d30e",
            tone: "bg-[#e9e5df]",
          };
        });
        setLiveProducts(mapped);
      })
      .catch(() => {
        if (active) setLiveProducts(null);
      });
    return () => { active = false; };
  }, []);

  const sourceProducts = liveProducts ?? products;

  const filtered = useMemo(() => sourceProducts.filter((product) => {
    const matchesCategory = category === "All finds" ||
      product.category.toLowerCase() === category.toLowerCase();
    const matchesSearch = `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [category, query, sourceProducts]);

  const toggleWishlist = (id: number | string) => {
    const saved = wishlist.includes(id);
    setWishlist((current) => saved ? current.filter((item) => item !== id) : [...current, id]);
    setNotice(saved ? "Removed from your wishlist" : "Saved to your wishlist");
    window.setTimeout(() => setNotice(""), 2200);
  };

  const addToCart = (name: string) => {
    setCart((count) => count + 1);
    setNotice(`${name} added to your bag`);
    window.setTimeout(() => setNotice(""), 2200);
  };

  return (
    <main className="min-h-screen overflow-clip bg-[#faf9f6] text-[#20211e]">
      <div className="flex min-h-9 items-center justify-center gap-2 bg-[#22231f] px-4 py-2 text-center text-[10px] tracking-[0.16em] text-white sm:text-[11px]">
        <Zap size={12} className="text-[#d6ed79]" />
        <span>THE NEXT WAY TO SHOP</span>
        <span className="hidden text-white/40 sm:inline">·</span>
        <span className="hidden sm:inline">Thoughtful finds. Better everyday.</span>
      </div>

      <header className="sticky top-0 z-40 border-b border-black/[0.07] bg-[#faf9f6]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[70px] max-w-[1440px] items-center justify-between gap-5 px-5 sm:px-8 lg:px-12">
          <button aria-label="Open navigation" onClick={() => setMenuOpen(!menuOpen)} className="rounded-full p-2 transition hover:bg-black/5 lg:hidden">
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
          <a href="#" className="shrink-0 text-[27px] font-black tracking-[-0.09em]">4D<span className="ml-1 text-[#85964b]">.</span></a>
          <nav className="hidden items-center gap-8 text-[12px] font-medium text-[#65665e] lg:flex">
            <a href="#discover" className="transition hover:text-black">Discover</a>
            <a href="#categories" className="transition hover:text-black">Categories</a>
            <a href="#edit" className="transition hover:text-black">The edit</a>
            <a href="#story" className="transition hover:text-black">Our point of view</a>
          </nav>
          <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-4">
            <label className="hidden h-10 w-40 items-center gap-2 rounded-full border border-black/10 px-3 xl:flex">
              <Search size={15} className="shrink-0 text-[#77786f]" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); document.getElementById("edit")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} placeholder="Find something..." aria-label="Search products" className="w-full bg-transparent text-xs outline-none placeholder:text-[#8c8c83]" />
            </label>
            <button aria-label="Focus product search" onClick={() => document.getElementById("product-search")?.focus()} className="rounded-full p-2 transition hover:bg-black/5 xl:hidden"><Search size={19} /></button>
            <button onClick={() => { document.getElementById("edit")?.scrollIntoView({ behavior: "smooth" }); setNotice(`${wishlist.length} saved item${wishlist.length === 1 ? "" : "s"} — select a heart to update your list`); window.setTimeout(() => setNotice(""), 2500); }} aria-label="Wishlist" className="relative rounded-full p-2 transition hover:bg-black/5">
              <Heart size={19} strokeWidth={1.6} />
              {wishlist.length > 0 && <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d6ed79] px-1 text-[9px]">{wishlist.length}</span>}
            </button>
            <button onClick={() => setNotice(`Your bag has ${cart} item${cart === 1 ? "" : "s"}`)} aria-label="Shopping bag" className="relative flex items-center gap-2 rounded-full bg-[#22231f] px-3 py-2.5 text-white transition hover:bg-[#44463b]">
              <ShoppingBag size={16} strokeWidth={1.7} /><span className="hidden text-xs sm:inline">Bag</span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d6ed79] px-1 text-[10px] font-semibold text-[#22231f]">{cart}</span>
            </button>
          </div>
        </div>
        <AnimatePresence>
          {menuOpen && <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-black/5 bg-[#faf9f6] px-6 lg:hidden">
            {["Discover", "Categories", "The edit", "Our point of view"].map((item) => <a key={item} onClick={() => setMenuOpen(false)} href={item === "Discover" ? "#discover" : item === "Categories" ? "#categories" : item === "The edit" ? "#edit" : "#story"} className="block border-b border-black/5 py-4 text-sm">{item}<ArrowUpRight className="float-right" size={16} /></a>)}
            <input id="product-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the collection..." className="my-4 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[#85964b]" />
          </motion.nav>}
        </AnimatePresence>
      </header>

      <section id="discover" className="mx-auto grid max-w-[1440px] gap-5 px-4 pb-12 pt-5 sm:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:gap-6 lg:px-12 lg:pb-20 lg:pt-7">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }} className="relative flex min-h-[470px] flex-col justify-between overflow-hidden rounded-[5px] bg-[#e7e7dc] p-7 sm:min-h-[560px] sm:p-10 lg:min-h-[650px] lg:p-14">
          <div className="pointer-events-none absolute -right-20 top-16 h-72 w-72 rounded-full border border-black/[0.08] sm:h-96 sm:w-96" />
          <div className="pointer-events-none absolute -right-6 top-32 h-56 w-56 rounded-full border border-black/[0.08] sm:h-72 sm:w-72" />
          <div className="relative z-10 flex items-center gap-2 text-[10px] tracking-[0.2em] text-[#68695e] sm:text-[11px]"><Sparkles size={13} /> A DIFFERENT KIND OF MARKETPLACE</div>
          <div className="relative z-10 max-w-xl py-10">
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mb-5 text-xs tracking-[0.18em] text-[#77786c]">LESS SCROLLING. MORE DISCOVERING.</motion.p>
            <h1 className="text-[clamp(3.6rem,8vw,7.7rem)] font-medium leading-[0.86] tracking-[-0.085em]">Find your<br />kind of <span className="font-serif italic font-normal text-[#758446]">better.</span></h1>
            <p className="mt-7 max-w-sm text-sm leading-6 text-[#66675d] sm:text-[15px] sm:leading-7">Good design. Useful details. Things you didn’t know you needed — until now.</p>
            <a href="#edit" className="group mt-8 inline-flex items-center gap-4 rounded-full bg-[#24251f] px-6 py-4 text-xs font-medium text-white transition duration-300 hover:bg-[#505342]">Explore the collection <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></a>
          </div>
          <div className="relative z-10 flex items-end justify-between border-t border-black/10 pt-5 text-[10px] tracking-[0.13em] text-[#707166]">
            <span>CURATED FOR EVERYDAY LIFE</span><span>01 — 04</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.1 }} className="group relative min-h-[390px] overflow-hidden rounded-[5px] bg-[#d8d4ca] sm:min-h-[500px] lg:min-h-[650px]">
          <motion.div className="absolute inset-0" initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}>
            <img src={photo("photo-1490481651871-ab68de25d43d", 1400)} alt="Thoughtfully curated contemporary fashion and everyday essentials" className="h-full w-full object-cover object-center transition-transform duration-[1400ms] group-hover:scale-[1.045]" />
          </motion.div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
          <div className="absolute left-6 top-6 rounded-full border border-white/50 bg-white/10 px-4 py-2 text-[10px] tracking-[0.15em] text-white backdrop-blur-md">THE EVERYDAY EDIT · NO. 01</div>
          <div className="absolute inset-x-6 bottom-7 flex items-end justify-between gap-4 text-white sm:inset-x-9 sm:bottom-9">
            <div><p className="mb-2 text-[10px] tracking-[0.19em] text-white/70">OBJECTS WITH A POINT OF VIEW</p><h2 className="max-w-xs text-3xl font-medium tracking-[-0.055em] sm:text-5xl">Everyday,<br />reimagined.</h2></div>
            <a href="#categories" aria-label="Explore categories" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#d6ed79] text-[#22231f] transition duration-300 hover:rotate-45"><ArrowDownRight size={23} /></a>
          </div>
        </motion.div>
      </section>

      <section id="categories" className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
        <div className="mb-7 flex items-end justify-between gap-4 sm:mb-10">
          <div><p className="mb-3 text-[10px] tracking-[0.2em] text-[#7a7b70]">A GOOD PLACE TO START</p><h2 className="text-3xl font-medium tracking-[-0.06em] sm:text-5xl">Explore your interests<span className="text-[#87964f]">.</span></h2></div>
          <span className="hidden pb-1 text-xs text-[#77786f] sm:block">Considered picks, all in one place.</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {categories.map((item, index) => <motion.button key={item.name} onClick={() => { setCategory(item.name); document.getElementById("edit")?.scrollIntoView({ behavior: "smooth" }); }} whileHover={{ y: -5 }} whileTap={{ scale: 0.985 }} className="group relative h-[220px] overflow-hidden rounded-[4px] bg-[#e7e4dc] text-left sm:h-[280px] lg:h-[320px]">
            <img src={photo(item.image, 600)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-black/10 transition-colors group-hover:from-black/75" />
            <span className="absolute left-4 top-4 text-[10px] tracking-[0.15em] text-white/80">{item.number} / 04</span>
            <div className="absolute inset-x-4 bottom-4 text-white sm:inset-x-5 sm:bottom-5"><div className="flex items-center justify-between"><h3 className="text-xl font-medium tracking-[-0.04em] sm:text-2xl">{item.name}</h3><ArrowUpRight size={19} className="transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" /></div><p className="mt-1 text-[11px] text-white/75">{item.detail}</p></div>
          </motion.button>)}
        </div>
      </section>

      <section id="edit" className="scroll-mt-24 bg-[#f0efe9] py-14 sm:py-20">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div><p className="mb-3 text-[10px] tracking-[0.2em] text-[#7a7b70]">THE GOOD STUFF, RIGHT NOW</p><h2 className="text-4xl font-medium tracking-[-0.065em] sm:text-6xl">The considered edit<span className="text-[#87964f]">.</span></h2><p className="mt-3 text-sm text-[#717168]">A few very good reasons to take a closer look.</p></div>
            <div className="flex flex-wrap gap-2">
              {["All finds", "Smartphones", "Laptops", "Audio", "Wearables", "Gaming", "Monitors"].map((name) => <button key={name} onClick={() => setCategory(name)} className={`rounded-full border px-4 py-2.5 text-[11px] transition-all duration-200 ${category === name ? "border-[#262720] bg-[#262720] text-white" : "border-black/10 bg-transparent text-[#65665e] hover:border-black/40"}`}>{name}</button>)}
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3 sm:hidden"><Search size={17} className="text-[#77786f]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the collection..." aria-label="Search products" className="w-full border-b border-black/20 bg-transparent py-2 text-sm outline-none focus:border-[#758446]" /></div>
          <div className="mt-9 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-3 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((product, index) => <motion.article key={product.id} layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.3, delay: index * 0.035 }} className="group min-w-0">
                <div className={`relative aspect-[0.87] overflow-hidden rounded-[4px] ${product.tone}`}>
                  <img src={product.image.startsWith("http") ? product.image : photo(product.image, 750)} alt={product.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.055]" />
                  <span className="absolute left-2 top-2 bg-[#faf9f6]/90 px-2 py-1.5 text-[8px] tracking-[0.1em] text-[#46473f] sm:left-3 sm:top-3 sm:text-[9px]">{product.tag}</span>
                  <button onClick={() => toggleWishlist(product.id)} aria-label={wishlist.includes(product.id) ? "Remove from wishlist" : "Add to wishlist"} className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md transition sm:right-3 sm:top-3 ${wishlist.includes(product.id) ? "bg-[#d6ed79] text-[#262720]" : "bg-white/85 text-[#262720] hover:bg-white"}`}><Heart size={16} fill={wishlist.includes(product.id) ? "currentColor" : "none"} /></button>
                  <button onClick={() => addToCart(product.name)} className="absolute inset-x-2 bottom-2 flex translate-y-2 items-center justify-between bg-[#faf9f6] px-3 py-3 text-[10px] font-medium opacity-0 transition-all duration-300 hover:bg-[#d6ed79] group-hover:translate-y-0 group-hover:opacity-100 sm:inset-x-3 sm:bottom-3 sm:px-4 sm:text-xs">Add to bag <ArrowUpRight size={15} /></button>
                </div>
                <div className="flex items-start justify-between gap-2 pt-3">
                  <div className="min-w-0"><p className="text-[9px] tracking-[0.12em] text-[#77786f] sm:text-[10px]">{product.category.toUpperCase()} <span className="mx-1">·</span> ★ {product.rating}</p><h3 className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-5 tracking-[-0.02em] sm:text-[15px]">{product.name}</h3><div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-[13px] font-semibold sm:text-sm">{money(product.price)}</span><span className="text-[10px] text-[#8a8b82] line-through">{money(product.old)}</span></div></div>
                  <button onClick={() => addToCart(product.name)} aria-label={`Add ${product.name} to bag`} className="mt-5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 transition hover:border-[#22231f] hover:bg-[#22231f] hover:text-white sm:hidden"><ShoppingBag size={15} /></button>
                </div>
              </motion.article>)}
            </AnimatePresence>
          </div>
          {filtered.length === 0 && <div className="py-20 text-center"><p className="text-xl">Nothing in this edit just yet.</p><button onClick={() => { setQuery(""); setCategory("All finds"); }} className="mt-3 text-sm underline underline-offset-4">Clear filters and start again</button></div>}
          <div className="mt-12 flex justify-center"><button onClick={() => { setCategory("All finds"); setQuery(""); }} className="group flex items-center gap-3 rounded-full border border-black/20 px-6 py-3.5 text-xs transition hover:border-[#22231f] hover:bg-[#22231f] hover:text-white">Explore all finds <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></button></div>
        </div>
      </section>

      <section id="story" className="mx-auto grid max-w-[1440px] gap-8 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:items-center lg:gap-20 lg:px-12 lg:py-28">
        <div className="relative min-h-[350px] overflow-hidden rounded-[4px] bg-[#e7e3d9] sm:min-h-[510px]">
          <img src={photo("photo-1494438639946-1ebd1d20bf85", 1100)} alt="A quiet, considered living space with thoughtfully chosen objects" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 hover:scale-[1.035]" />
          <div className="absolute bottom-4 left-4 bg-[#faf9f6]/90 px-4 py-3 text-[10px] tracking-[0.1em] text-[#45463e]">LESS, BUT BETTER CHOSEN.</div>
        </div>
        <div className="lg:py-10">
          <p className="mb-5 text-[10px] tracking-[0.2em] text-[#7a7b70]">A LITTLE MORE INTENTIONAL</p>
          <h2 className="max-w-xl text-5xl font-medium leading-[0.98] tracking-[-0.075em] sm:text-7xl">Not more things.<br /><span className="font-serif italic font-normal text-[#758446]">Better things.</span></h2>
          <p className="mt-7 max-w-lg text-sm leading-7 text-[#6d6e64] sm:text-base sm:leading-8">Shopping should feel like discovering something that fits your life, not sorting through everything that doesn’t. We bring useful design, considered details and everyday favourites into one calmer place.</p>
          <a href="#categories" className="group mt-8 inline-flex items-center gap-4 border-b border-[#8a8b80] pb-3 text-xs font-medium">Get to know the edit <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></a>
          <div className="mt-12 grid max-w-lg grid-cols-3 gap-4 border-t border-black/10 pt-6"><div><p className="text-xl font-medium tracking-tight sm:text-2xl">01.</p><p className="mt-2 text-[10px] leading-4 text-[#77786f] sm:text-xs">Useful by design</p></div><div><p className="text-xl font-medium tracking-tight sm:text-2xl">02.</p><p className="mt-2 text-[10px] leading-4 text-[#77786f] sm:text-xs">Quality over noise</p></div><div><p className="text-xl font-medium tracking-tight sm:text-2xl">03.</p><p className="mt-2 text-[10px] leading-4 text-[#77786f] sm:text-xs">Made for real life</p></div></div>
        </div>
      </section>

      <section className="mx-4 mb-8 overflow-hidden rounded-[4px] bg-[#dce6bd] px-6 py-12 sm:mx-8 sm:px-12 sm:py-16 lg:mx-12 lg:px-20">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-7 md:flex-row md:items-end">
          <div><p className="mb-3 text-[10px] tracking-[0.2em] text-[#626c49]">A BETTER INBOX</p><h2 className="max-w-xl text-4xl font-medium tracking-[-0.065em] sm:text-6xl">Good finds.<br />Occasionally delivered.</h2><p className="mt-4 text-sm text-[#616650]">Fresh discoveries, thoughtful edits and things worth knowing about.</p></div>
          <form onSubmit={(e) => { e.preventDefault(); setNotice("Newsletter signup will be connected to the backend."); window.setTimeout(() => setNotice(""), 2800); }} className="flex w-full max-w-md gap-2 border-b border-[#727c5b] pb-2"><input type="email" required placeholder="Your email address" aria-label="Your email address" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-[#6b705a]" /><button aria-label="Subscribe" type="submit" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#24251f] text-white transition hover:rotate-45"><ArrowUpRight size={19} /></button></form>
        </div>
      </section>

      <footer className="bg-[#22231f] px-5 pb-8 pt-12 text-white sm:px-8 sm:pt-16 lg:px-12">
        <div className="mx-auto max-w-[1440px]">
          <div className="grid gap-10 border-b border-white/10 pb-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div><a href="#" className="text-4xl font-black tracking-[-0.09em]">4D<span className="text-[#d6ed79]">.</span></a><p className="mt-4 max-w-xs text-sm leading-6 text-white/55">Find your kind of better. Thoughtful discoveries for the way you live.</p></div>
            <div><h3 className="mb-4 text-xs font-medium">Explore</h3>{["All finds", "Technology", "Lifestyle", "Living"].map((x) => <a key={x} href="#categories" className="block py-1.5 text-xs text-white/55 transition hover:text-white">{x}</a>)}</div>
            <div><h3 className="mb-4 text-xs font-medium">Need a hand?</h3>{["Contact us", "Delivery & returns", "FAQs", "Track an order"].map((x) => <a key={x} href="#story" className="block py-1.5 text-xs text-white/55 transition hover:text-white">{x}</a>)}</div>
            <div><h3 className="mb-4 text-xs font-medium">The essentials</h3>{["About 4D", "Privacy policy", "Terms of service", "Shipping policy"].map((x) => <a key={x} href="#story" className="block py-1.5 text-xs text-white/55 transition hover:text-white">{x}</a>)}</div>
          </div>
          <div className="flex flex-col justify-between gap-3 pt-6 text-[10px] text-white/40 sm:flex-row sm:items-center"><span>© 2026 4D Commerce. A little more intentional.</span><span>MADE FOR THE EVERYDAY.</span></div>
        </div>
      </footer>

      <AnimatePresence>
        {notice && <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} role="status" className="fixed bottom-5 left-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-[#22231f] px-5 py-3.5 text-center text-xs text-white shadow-2xl">{notice}</motion.div>}
      </AnimatePresence>
    </main>
  );
}
