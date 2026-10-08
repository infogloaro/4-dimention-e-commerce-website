"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ArrowRight, ArrowUpRight, Filter, Headphones, Heart, Laptop, MapPin, Menu,
  Search, ShoppingBag, Smartphone, Sparkles, X, Zap,
} from "lucide-react";
import { CHECKOUT_STORAGE_KEY } from "./checkout-data";
import BrandLogo from "./brand-logo";
import NewArrivalsCarousel from "./NewArrivalsCarousel/NewArrivalsCarousel";
import ProductDNASection from "./ProductDNASection";
import { fetchElectronicsProducts, type StoreProduct } from "@/services/product-api";
import { STORE_ADDRESS, STORE_NAME } from "@/lib/store-brand";

type CartItem = {
  product: StoreProduct;
  quantity: number;
};
type ProductCategory = {
  slug: string;
  name: string;
  detail: string;
  image: string;
};
const categoryDetails: Record<string, Omit<ProductCategory, "slug">> = {
  smartphones: { name: "Smartphones", detail: "Explore smartphones and iPhones", image: "photo-1511707171634-5f897ff02aa9" },
  tablets: { name: "Tablets & e-readers", detail: "Versatile screens for anywhere", image: "photo-1544244015-0df4b3ffc6b0" },
  laptops: { name: "Laptops & ultrabooks", detail: "Portable computers for work and play", image: "photo-1496181133206-80ce9b88a853" },
  "gaming-laptops": { name: "Gaming laptops", detail: "Performance laptops for gaming", image: "photo-1496181133206-80ce9b88a853" },
  audio: { name: "Headphones & audio", detail: "Headphones, earbuds, and speakers", image: "photo-1505740420928-5e560c06d30e" },
  wearables: { name: "Smart wearables", detail: "Smartwatches and fitness trackers", image: "photo-1523275335684-37898b6baf30" },
  monitors: { name: "Monitors & displays", detail: "Displays for work, gaming, and creation", image: "photo-1527443224154-c4a3942d3acf" },
  components: { name: "Computer components", detail: "Processors, storage, and components", image: "photo-1591799264318-7e6ef8ddb7ea" },
  "gaming-gear": { name: "Gaming gear", detail: "Keyboards, mice, and gaming accessories", image: "photo-1587829741301-dc798b83add3" },
  cameras: { name: "Cameras & photography", detail: "Cameras and photography equipment", image: "photo-1516035069371-29a1b244cc32" },
  networking: { name: "Networking & power", detail: "Routers, chargers, and connectivity", image: "photo-1558494949-ef010cbdcc31" },
  "mobile-accessories": { name: "Mobile accessories", detail: "Chargers, cases, and phone add-ons", image: "photo-1601972599720-36938d4ecd31" },
};
const shopNavigation = [
  { label: "Shop electronics", href: "#edit", category: "all" },
  { label: "Categories", href: "#categories" },
  { label: "Offers", href: "#edit", category: "all" },
  { label: "Our story", href: "#story" },
];


const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

const photo = (id: string, width = 900) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;

export default function HomePage() {
  const router = useRouter();
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<"recommended" | "rating" | "name">("recommended");
  const [wishlist, setWishlist] = useState<(number | string)[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [globotOpen, setGlobotOpen] = useState(false);
  const [globotReply, setGlobotReply] = useState("Hi! I'm your HI-FI shopping assistant. What can I help you find?");
  const [apiProducts, setApiProducts] = useState<StoreProduct[]>([]);
  const [apiProductsStatus, setApiProductsStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [usdToInrRate, setUsdToInrRate] = useState<number | null>(null);
  const [exchangeRateStatus, setExchangeRateStatus] = useState<"loading" | "loaded" | "error">("loading");
  const categorySliderRef = useRef<HTMLDivElement>(null);
  const categoryAutoPauseUntilRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Exchange-rate request failed (${response.status})`);
        const payload: unknown = await response.json();
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("rates" in payload) ||
          typeof payload.rates !== "object" ||
          payload.rates === null ||
          !("INR" in payload.rates) ||
          typeof payload.rates.INR !== "number" ||
          !Number.isFinite(payload.rates.INR)
        ) {
          throw new Error("The exchange-rate service returned an invalid response");
        }
        return payload.rates.INR;
      })
      .then((rate) => {
        if (!active) return;
        setUsdToInrRate(rate);
        setExchangeRateStatus("loaded");
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        console.error("Failed to load USD to INR exchange rate", error);
        setExchangeRateStatus("error");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchElectronicsProducts(controller.signal)
      .then((mapped) => {
        if (!active) return;
        setApiProducts(mapped);
        setApiProductsStatus("loaded");
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        console.error("Failed to load electronics products from DummyJSON", error);
        setApiProductsStatus("error");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const allProducts = apiProducts;
  const availableCategories = useMemo(() => {
    const productCategories = new Map<string, string>();
    for (const product of allProducts) {
      if (!productCategories.has(product.category)) productCategories.set(product.category, product.categoryName);
    }
    return Array.from(productCategories, ([slug, productName], index) => ({
      slug,
      name: categoryDetails[slug]?.name ?? productName,
      detail: categoryDetails[slug]?.detail ?? `Shop ${productName.toLowerCase()}`,
      image: categoryDetails[slug]?.image ?? "photo-1550009158-9ebf69173e03",
      number: String(index + 1).padStart(2, "0"),
    }));
  }, [allProducts]);

  useEffect(() => {
    const track = categorySliderRef.current;
    if (!track || availableCategories.length < 2) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let isVisible = false;
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    }, { threshold: 0.2 });
    observer.observe(track);

    const interval = window.setInterval(() => {
      if (
        !isVisible ||
        document.visibilityState !== "visible" ||
        track.matches(":hover") ||
        track.contains(document.activeElement) ||
        Date.now() < categoryAutoPauseUntilRef.current
      ) return;

      const firstCard = track.querySelector<HTMLElement>(".category-card");
      if (!firstCard) return;

      const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 0;
      const step = firstCard.offsetWidth + gap;
      const maxScroll = track.scrollWidth - track.clientWidth;
      if (maxScroll <= 0) return;

      const nextPosition = track.scrollLeft + step;
      track.scrollTo({
        left: nextPosition >= maxScroll - 2 ? 0 : nextPosition,
        behavior: "smooth",
      });
    }, 4200);

    return () => {
      window.clearInterval(interval);
      observer.disconnect();
    };
  }, [availableCategories.length]);

  const pauseCategoryAutoSlide = () => {
    categoryAutoPauseUntilRef.current = Date.now() + 7000;
  };

  const scrollCategories = (direction: -1 | 1) => {
    pauseCategoryAutoSlide();
    const track = categorySliderRef.current;
    if (!track) return;
    const firstCard = track.querySelector<HTMLElement>(".category-card");
    const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 0;
    const step = firstCard ? firstCard.offsetWidth + gap : track.clientWidth * 0.75;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  const filtered = useMemo(() => {
    const results = allProducts.filter((product) => {
      const matchesCategory = category === "all" || product.category === category;
      const matchesSearch = `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase());
      const matchesRating = Number(product.rating) >= minRating;
      const matchesAvailability = !inStockOnly || product.available;
      return matchesCategory && matchesSearch && matchesRating && matchesAvailability;
    });
    if (sortOrder === "rating") return results.toSorted((a, b) => Number(b.rating) - Number(a.rating));
    if (sortOrder === "name") return results.toSorted((a, b) => a.name.localeCompare(b.name));
    return results;
  }, [allProducts, category, inStockOnly, minRating, query, sortOrder]);
  const activeFilterCount = Number(category !== "all") + Number(minRating > 0) + Number(inStockOnly);

  const toggleWishlist = (id: number | string) => {
    const saved = wishlist.includes(id);
    setWishlist((current) => saved ? current.filter((item) => item !== id) : [...current, id]);
    setNotice(saved ? "Removed from your wishlist" : "Saved to your wishlist");
    window.setTimeout(() => setNotice(""), 2200);
  };

  const addToCart = (product: StoreProduct) => {
    setCart((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      if (existing) {
        return items.map((item) => item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item);
      }
      return [...items, { product, quantity: 1 }];
    });
    setCartOpen(true);
    setNotice(`${product.name} added to your bag`);
    window.setTimeout(() => setNotice(""), 2200);
  };
  const updateCartQuantity = (productId: StoreProduct["id"], change: number) => {
    setCart((items) => items.flatMap((item) => {
      if (item.product.id !== productId) return [item];
      const quantity = item.quantity + change;
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  };
  const startCheckout = () => {
    if (!cart.length || usdToInrRate === null) return;

    try {
      sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify({
        items: cart.map(({ product, quantity }) => ({
          id: String(product.id),
          name: product.name,
          image: product.image.startsWith("http") ? product.image : photo(product.image, 300),
          unitPrice: Math.round(product.price * usdToInrRate),
          quantity,
        })),
      }));
      setCartOpen(false);
      router.push("/checkout");
    } catch (error) {
      console.error("Failed to start checkout", error);
      setNotice("Unable to start checkout. Please try again.");
      window.setTimeout(() => setNotice(""), 2500);
    }
  };
  const startCheckoutWithProduct = (product: StoreProduct) => {
    if (usdToInrRate === null) return;

    try {
      sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify({
        items: [{
          id: String(product.id),
          name: product.name,
          image: product.image,
          unitPrice: Math.round(product.price * usdToInrRate),
          quantity: 1,
        }],
      }));
      router.push("/checkout");
    } catch (error) {
      console.error("Failed to start checkout", error);
      setNotice("Unable to start checkout. Please try again.");
      window.setTimeout(() => setNotice(""), 2500);
    }
  };

  const cartCount = cart.reduce((count, item) => count + item.quantity, 0);
  const cartTotal = cart.reduce((total, item) => total + item.product.price * item.quantity, 0);

  const navigateToCategory = (name: string) => {
    setCategory(name);
    setMenuOpen(false);
    document.getElementById("edit")?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!filterOpen && !cartOpen && !selectedProduct && !globotOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFilterOpen(false);
        setCartOpen(false);
        setSelectedProduct(null);
        setGlobotOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [cartOpen, filterOpen, globotOpen, selectedProduct]);

  return (
    <main className="min-h-screen overflow-clip bg-[#faf9f6] text-[#20211e]">
      <div className="flex min-h-9 items-center justify-center gap-2 bg-[#22231f] px-4 py-2 text-center text-[10px] tracking-[0.16em] text-white sm:text-[11px]">
        <Zap size={12} className="text-[#d6ed79]" />
        <span>THE NEXT WAY TO SHOP</span>
        <span className="hidden text-white/40 sm:inline">·</span>
        <span className="hidden sm:inline">Thoughtful finds. Better everyday.</span>
      </div>

      <header className="sticky top-0 z-40 border-b border-black/10 bg-[#faf9f6]/90 shadow-md backdrop-blur-xl">
        <div className="mx-auto flex h-[70px] max-w-[1440px] items-center justify-between gap-5 px-5 sm:px-8 lg:px-12">
          <button aria-label="Open navigation" onClick={() => setMenuOpen(!menuOpen)} className="rounded-full p-2 transition hover:bg-black/5 lg:hidden">
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
          <a href="#" aria-label={`${STORE_NAME} home`} className="shrink-0">
            <BrandLogo />
          </a>
          <nav aria-label="Main navigation" className="hidden items-center gap-1 text-sm font-semibold text-[#4d5832] lg:flex">
            {shopNavigation.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => item.category ? navigateToCategory(item.category) : setMenuOpen(false)}
                className="rounded-xl border border-transparent px-3.5 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/80 hover:bg-[#d6ed79] hover:text-[#22231f] hover:shadow-[inset_1px_1px_3px_rgba(255,255,255,0.75),0_3px_8px_rgba(94,112,48,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#758446]"
              >
                {item.label}
              </a>
            ))}
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
            <button onClick={() => setCartOpen(true)} aria-label={`Shopping bag with ${cartCount} items`} className="relative flex items-center gap-2 rounded-full bg-[#22231f] px-3 py-2.5 text-white transition hover:bg-[#44463b]">
              <ShoppingBag size={16} strokeWidth={1.7} /><span className="hidden text-xs sm:inline">Bag</span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d6ed79] px-1 text-[10px] font-semibold text-[#22231f]">{cartCount}</span>
            </button>
          </div>
        </div>
        <AnimatePresence>
          {menuOpen && <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-black/5 bg-[#faf9f6] px-6 lg:hidden">
            {shopNavigation.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => item.category ? navigateToCategory(item.category) : setMenuOpen(false)}
                className="mb-2 flex items-center justify-between rounded-xl border border-white/80 bg-gradient-to-br from-[#f1f6df] to-[#dce8b6] px-4 py-3 text-sm font-semibold text-[#4d5832] shadow-[inset_2px_2px_5px_rgba(120,139,70,0.12),inset_-2px_-2px_5px_rgba(255,255,255,0.85),0_3px_8px_rgba(94,112,48,0.1)] transition hover:bg-[#d6ed79] hover:text-[#22231f]"
              >
                {item.label}<ArrowUpRight size={16} />
              </a>
            ))}
            <input id="product-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the collection..." className="my-4 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[#85964b]" />
          </motion.nav>}
        </AnimatePresence>
      </header>

      <section aria-label="Special offers" className="relative isolate min-h-[390px] overflow-hidden bg-[#22231f] text-white sm:min-h-[340px]">
        <div className="pointer-events-none absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full border border-[#d6ed79]/20 sm:right-[27%] sm:-top-48 sm:h-[34rem] sm:w-[34rem]" />
        <div className="pointer-events-none absolute -right-10 -top-12 -z-10 h-48 w-48 rounded-full border border-[#d6ed79]/15 sm:right-[33%] sm:-top-32 sm:h-72 sm:w-72" />
        <div className="absolute inset-x-0 top-0 h-[48%] overflow-hidden sm:inset-y-0 sm:left-auto sm:right-0 sm:h-auto sm:w-[58%]">
          <img
            src={photo("photo-1496181133206-80ce9b88a853", 1400)}
            alt="Laptop from the HI-FI electronics tech edit"
            className="h-full w-full object-cover object-center opacity-65 sm:opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#22231f]/15 via-[#22231f]/30 to-[#22231f] sm:bg-gradient-to-r sm:from-[#22231f] sm:via-[#22231f]/20 sm:to-transparent" />
          <div className="absolute inset-0 hidden border-l-[3px] border-[#d6ed79]/70 sm:block [clip-path:ellipse(94%_130%_at_100%_50%)]" />
        </div>
        <div className="relative mx-auto flex min-h-[390px] max-w-[1440px] items-end px-5 pb-8 pt-[190px] sm:min-h-[340px] sm:items-center sm:px-8 sm:py-12 lg:px-12">
          <div className="max-w-xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#d6ed79]/40 bg-[#d6ed79]/10 px-3 py-1.5 text-[9px] font-semibold tracking-[0.16em] text-[#d6ed79] backdrop-blur-sm sm:text-[10px]">
              <Sparkles size={12} /> THE HI-FI TECH EDIT
            </p>
            <h2 className="text-3xl font-semibold leading-tight tracking-[-0.06em] sm:text-4xl lg:text-5xl">A brighter deal<br className="hidden sm:block" /> on better tech.</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-white/70 sm:text-base">Explore special prices across smartphones, laptops, audio and more.</p>
            <button
              type="button"
              onClick={() => document.getElementById("edit")?.scrollIntoView({ behavior: "smooth" })}
              className="mt-5 inline-flex items-center gap-3 rounded-full bg-[#d6ed79] px-5 py-3 text-sm font-semibold text-[#22231f] shadow-[0_8px_30px_rgba(214,237,121,0.2)] transition hover:translate-y-[-2px] hover:bg-[#e3f89a]"
            >
              Shop offers <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      <NewArrivalsCarousel
        products={apiProducts}
        status={apiProductsStatus}
        exchangeRate={usdToInrRate}
        wishlist={wishlist}
        onAddToCart={addToCart}
        onBuyNow={startCheckoutWithProduct}
        onToggleWishlist={toggleWishlist}
      />

      <ProductDNASection products={apiProducts} status={apiProductsStatus} />

      <section id="categories" className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
        <div className="mb-7 flex items-end justify-between gap-4 sm:mb-10">
          <div><p className="mb-3 text-[10px] tracking-[0.2em] text-[#7a7b70]">A GOOD PLACE TO START</p><h2 className="text-3xl font-medium tracking-[-0.06em] sm:text-5xl">Explore your interests<span className="text-[#87964f]">.</span></h2></div>
          <span className="hidden pb-1 text-xs text-[#77786f] sm:block">Considered picks, all in one place.</span>
        </div>

        <div className="category-slider-shell">
          <div
            ref={categorySliderRef}
            className="category-slider-track"
            onPointerDown={pauseCategoryAutoSlide}
            onFocusCapture={pauseCategoryAutoSlide}
          >
            {availableCategories.map((item) => (
              <motion.button
                key={item.slug}
                onClick={() => navigateToCategory(item.slug)}
                whileHover={{ y: -5 }}
                whileTap={{ scale: 0.985 }}
                className="category-card group relative overflow-hidden rounded-[4px] bg-[#e7e4dc] text-left"
              >
                <img src={photo(item.image, 600)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-black/10 transition-colors group-hover:from-black/75" />
                <span className="absolute left-4 top-4 text-[10px] tracking-[0.15em] text-white/80">{item.number} / {String(availableCategories.length).padStart(2, "0")}</span>
                <div className="absolute inset-x-4 bottom-4 text-white sm:inset-x-5 sm:bottom-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-medium tracking-[-0.04em] sm:text-2xl">{item.name}</h3>
                    <ArrowUpRight size={19} className="transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" />
                  </div>
                  <p className="mt-1 text-[11px] text-white/75">{item.detail}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {availableCategories.length > 0 && <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Previous category slide"
            onClick={() => scrollCategories(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 transition hover:border-black/40 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowRight size={15} className="rotate-180" />
          </button>
          <span className="text-xs text-[#77786f]">Swipe to explore categories</span>
          <button
            type="button"
            aria-label="Next category"
            onClick={() => scrollCategories(1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 transition hover:border-black/40 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowRight size={15} />
          </button>
        </div>}
      </section>

      <section id="edit" className="scroll-mt-24 bg-[#f0efe9] py-14 sm:py-20">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div><p className="mb-3 text-[10px] tracking-[0.2em] text-[#7a7b70]">THE GOOD STUFF, RIGHT NOW</p><h2 className="text-4xl font-medium tracking-[-0.065em] sm:text-6xl">The considered edit<span className="text-[#87964f]">.</span></h2><p className="mt-3 text-sm text-[#717168]">A few very good reasons to take a closer look.</p></div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={filterOpen}
                className="inline-flex items-center gap-2 rounded-full border border-black/20 bg-[#faf9f6] px-5 py-3 text-sm font-semibold transition hover:border-black/50"
              >
                <Filter size={16} />
                Filter
                {activeFilterCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d6ed79] px-1 text-[10px] text-[#22231f]">{activeFilterCount}</span>}
              </button>
            </div>
          </div>
          {apiProductsStatus === "loading" && <p role="status" className="mt-5 text-sm text-[#717168]">Loading electronics categories…</p>}
          {apiProductsStatus === "error" && <p role="alert" className="mt-5 text-sm text-[#717168]">Electronics are unavailable right now. Please try again later.</p>}
          {exchangeRateStatus === "error" && <p role="alert" className="mt-5 text-sm text-[#717168]">INR prices are temporarily unavailable because the exchange rate could not be loaded.</p>}
          <div className="mt-6 flex items-center gap-3 sm:hidden"><Search size={17} className="text-[#77786f]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the collection..." aria-label="Search products" className="w-full border-b border-black/20 bg-transparent py-2 text-sm outline-none focus:border-[#758446]" /></div>
          <div className="mt-9 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-3 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((product, index) => <motion.article key={product.id} layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.3, delay: index * 0.035 }} className="group min-w-0 overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg">
                <div className={`relative aspect-[1.74] overflow-hidden ${product.tone}`}>
                  <button type="button" onClick={() => setSelectedProduct(product)} aria-label={`View details for ${product.name}`} className="absolute inset-0 z-0 cursor-pointer">
                    <img src={product.image.startsWith("http") ? product.image : photo(product.image, 750)} alt={product.name} loading="lazy" className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-105" />
                  </button>
                  <span className="pointer-events-none absolute left-2 top-2 z-10 bg-[#faf9f6]/90 px-2 py-1.5 text-[8px] tracking-[0.1em] text-[#46473f] sm:left-3 sm:top-3 sm:text-[9px]">{product.tag}</span>
                  <button onClick={() => toggleWishlist(product.id)} aria-label={wishlist.includes(product.id) ? "Remove from wishlist" : "Add to wishlist"} className={`absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md transition sm:right-3 sm:top-3 ${wishlist.includes(product.id) ? "bg-[#d6ed79] text-[#262720]" : "bg-white/85 text-[#262720] hover:bg-white"}`}><Heart size={16} fill={wishlist.includes(product.id) ? "currentColor" : "none"} /></button>
                  <button onClick={() => addToCart(product)} style={{ backgroundImage: "linear-gradient(110deg, #22231f 0%, #454936 58%, #758446 100%)" }} className="absolute inset-x-2 bottom-2 z-10 flex translate-y-2 items-center justify-between rounded-md px-3 py-3 text-[10px] font-semibold text-white opacity-0 shadow-md transition-all duration-300 hover:brightness-110 group-hover:translate-y-0 group-hover:opacity-100 sm:inset-x-3 sm:bottom-3 sm:px-4 sm:text-xs">Add to bag <ArrowUpRight size={15} /></button>
                </div>
                <div className="flex items-start justify-between gap-2 p-3 sm:p-4">
                  <div className="min-w-0"><p className="text-[9px] tracking-[0.12em] text-[#77786f] sm:text-[10px]">{availableCategories.find((item) => item.slug === product.category)?.name.toUpperCase() ?? product.categoryName.toUpperCase()}{product.rating && <> <span className="mx-1">·</span> ★ {product.rating}</>}</p><button type="button" onClick={() => setSelectedProduct(product)} className="mt-1.5 line-clamp-2 text-left text-[13px] font-medium leading-5 tracking-[-0.02em] transition hover:underline hover:underline-offset-2 sm:text-[15px]">{product.name}</button><div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-[13px] font-semibold sm:text-sm">{usdToInrRate === null ? "Price unavailable" : money(product.price * usdToInrRate)}</span>{usdToInrRate !== null && product.old > product.price && <span className="text-[10px] text-[#8a8b82] line-through">{money(product.old * usdToInrRate)}</span>}</div></div>
                  <button onClick={() => addToCart(product)} aria-label={`Add ${product.name} to bag`} className="mt-5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 transition hover:border-[#22231f] hover:bg-[#22231f] hover:text-white sm:hidden"><ShoppingBag size={15} /></button>
                </div>
              </motion.article>)}
            </AnimatePresence>
          </div>
          {apiProductsStatus === "loaded" && filtered.length === 0 && <div className="py-20 text-center"><p className="text-xl">Nothing in this edit just yet.</p><button onClick={() => { setQuery(""); setCategory("all"); setMinRating(0); setInStockOnly(false); }} className="mt-3 text-sm underline underline-offset-4">Clear filters and start again</button></div>}
          <div className="mt-12 flex justify-center"><button onClick={() => { setCategory("all"); setQuery(""); setMinRating(0); setInStockOnly(false); setSortOrder("recommended"); }} className="group flex items-center gap-3 rounded-full border border-black/20 px-6 py-3.5 text-xs transition hover:border-[#22231f] hover:bg-[#22231f] hover:text-white">Explore electronics <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></button></div>
        </div>
      </section>

      <AnimatePresence>
        {filterOpen && <>
          <motion.button
            type="button"
            aria-label="Close filters"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFilterOpen(false)}
            className="fixed inset-0 z-50 bg-black/40"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-filter-heading"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25 }}
            style={{ backgroundImage: "linear-gradient(155deg, #faf9f6 0%, #f3f2ec 58%, #e8ebdc 100%)" }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-black/10 px-6 py-5">
              <div>
                <h2 id="product-filter-heading" className="text-xl font-semibold">Filter electronics</h2>
                <p className="mt-1 text-sm text-[#717168]">{filtered.length} products match</p>
              </div>
              <button type="button" aria-label="Close filters" onClick={() => setFilterOpen(false)} className="rounded-full p-2 transition hover:bg-black/5">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
              <fieldset>
                <legend className="mb-3 text-sm font-semibold">Category</legend>
                <div className="space-y-1">
                  <button type="button" onClick={() => setCategory("all")} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${category === "all" ? "bg-[#e9eadf] font-semibold" : "hover:bg-black/5"}`}>
                    <span>All electronics</span><span className="text-xs text-[#717168]">{allProducts.length}</span>
                  </button>
                  {availableCategories.map((item) => {
                    const count = allProducts.filter((product) => product.category === item.slug).length;
                    return <button key={item.slug} type="button" onClick={() => setCategory(item.slug)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${category === item.slug ? "bg-[#e9eadf] font-semibold" : "hover:bg-black/5"}`}>
                      <span>{item.name}</span><span className="text-xs text-[#717168]">{count}</span>
                    </button>;
                  })}
                </div>
              </fieldset>
              <label className="block text-sm font-semibold">
                Minimum rating
                <select value={minRating} onChange={(event) => setMinRating(Number(event.target.value))} className="mt-2 w-full rounded-lg border border-black/15 bg-white px-3 py-3 font-normal outline-none focus:border-[#758446]">
                  <option value={0}>Any rating</option>
                  <option value={3}>3 stars & up</option>
                  <option value={4}>4 stars & up</option>
                  <option value={4.5}>4.5 stars & up</option>
                </select>
              </label>
              <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
                <input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} className="h-4 w-4 accent-[#758446]" />
                In-stock products only
              </label>
              <label className="block text-sm font-semibold">
                Sort products
                <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)} className="mt-2 w-full rounded-lg border border-black/15 bg-white px-3 py-3 font-normal outline-none focus:border-[#758446]">
                  <option value="recommended">Recommended</option>
                  <option value="rating">Top rated</option>
                  <option value="name">Name: A to Z</option>
                </select>
              </label>
            </div>
            <div className="flex gap-3 border-t border-black/10 p-6">
              <button type="button" onClick={() => { setCategory("all"); setMinRating(0); setInStockOnly(false); setSortOrder("recommended"); }} className="flex-1 rounded-full border border-black/20 px-5 py-3 text-sm font-semibold transition hover:border-black/50">
                Clear filters
              </button>
              <button type="button" onClick={() => setFilterOpen(false)} className="flex-1 rounded-full bg-[#22231f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#44463b]">
                Show {filtered.length} products
              </button>
            </div>
          </motion.aside>
        </>}
      </AnimatePresence>

      <AnimatePresence>
        {selectedProduct && <>
          <motion.button
            type="button"
            aria-label="Close product details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedProduct(null)}
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-detail-heading"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-[70] max-h-[90vh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-black/10 bg-[#faf9f6] shadow-2xl"
          >
            <button type="button" aria-label="Close product details" onClick={() => setSelectedProduct(null)} className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 shadow-sm transition hover:bg-white sm:right-4 sm:top-4">
              <X size={20} />
            </button>
            <div className="grid sm:grid-cols-2">
              <div className={`flex min-h-64 items-center justify-center p-8 sm:min-h-[420px] ${selectedProduct.tone}`}>
                <img src={selectedProduct.image} alt={selectedProduct.name} className="max-h-80 w-full object-contain" />
              </div>
              <div className="flex flex-col p-6 sm:p-9">
                <p className="text-[10px] tracking-[0.16em] text-[#77786f]">{availableCategories.find((item) => item.slug === selectedProduct.category)?.name.toUpperCase() ?? selectedProduct.categoryName.toUpperCase()}</p>
                <h2 id="product-detail-heading" className="mt-3 pr-8 text-2xl font-semibold leading-tight tracking-[-0.04em] sm:text-3xl">{selectedProduct.name}</h2>
                {selectedProduct.rating && <p className="mt-3 text-sm text-[#62635b]">★ {selectedProduct.rating} / 5</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xl font-semibold">{usdToInrRate === null ? "Price unavailable" : money(selectedProduct.price * usdToInrRate)}</span>
                  {usdToInrRate !== null && selectedProduct.old > selectedProduct.price && <span className="text-sm text-[#8a8b82] line-through">{money(selectedProduct.old * usdToInrRate)}</span>}
                </div>
                <p className={`mt-4 text-sm font-medium ${selectedProduct.stock > 0 ? "text-[#53652e]" : "text-red-700"}`}>
                  {selectedProduct.stock > 0 ? `${selectedProduct.stock} in stock` : "Out of stock"}
                </p>
                <p className="mt-5 text-sm leading-6 text-[#65665e]">{selectedProduct.description}</p>
                <button
                  type="button"
                  disabled={!selectedProduct.available}
                  onClick={() => addToCart(selectedProduct)}
                  style={{ backgroundImage: "linear-gradient(110deg, #22231f 0%, #454936 58%, #758446 100%)" }}
                  className="mt-auto flex items-center justify-between rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add to bag <ArrowUpRight size={17} />
                </button>
              </div>
            </div>
          </motion.section>
        </>}
      </AnimatePresence>

      <AnimatePresence>
        {cartOpen && <>
          <motion.button
            type="button"
            aria-label="Close shopping bag"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCartOpen(false)}
            className="fixed inset-0 z-[60] bg-black/40"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="shopping-bag-heading"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25 }}
            className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-md flex-col bg-[#faf9f6] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-black/10 px-6 py-5">
              <div>
                <h2 id="shopping-bag-heading" className="text-xl font-semibold">Your shopping bag</h2>
                <p className="mt-1 text-sm text-[#717168]">{cartCount} {cartCount === 1 ? "item" : "items"}</p>
              </div>
              <button type="button" aria-label="Close shopping bag" onClick={() => setCartOpen(false)} className="rounded-full p-2 transition hover:bg-black/5">
                <X size={20} />
              </button>
            </div>
            {cart.length === 0
              ? <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                  <ShoppingBag size={32} strokeWidth={1.4} className="text-[#77786f]" />
                  <p className="mt-4 text-lg font-medium">Your bag is empty</p>
                  <p className="mt-2 text-sm text-[#717168]">Add an item to see it here.</p>
                </div>
              : <>
                  <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                    {cart.map(({ product, quantity }) => (
                      <div key={product.id} className="flex gap-4 rounded-lg border border-black/10 bg-white p-3 shadow-sm">
                        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-[#f0efe9]">
                          <img src={product.image} alt={product.name} loading="lazy" className="h-full w-full object-contain p-2" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
                          <p className="mt-1 text-sm font-semibold">
                            {usdToInrRate === null ? "Price unavailable" : money(product.price * usdToInrRate)}
                          </p>
                          <div className="mt-auto flex items-center justify-between pt-2">
                            <div className="flex items-center gap-3 rounded-full border border-black/10 px-2 py-1">
                              <button type="button" aria-label={`Remove one ${product.name}`} onClick={() => updateCartQuantity(product.id, -1)} className="px-1 text-lg leading-none">−</button>
                              <span className="min-w-4 text-center text-xs">{quantity}</span>
                              <button type="button" aria-label={`Add one ${product.name}`} onClick={() => updateCartQuantity(product.id, 1)} className="px-1 text-lg leading-none">+</button>
                            </div>
                            <button type="button" onClick={() => setCart((items) => items.filter((item) => item.product.id !== product.id))} className="text-xs text-[#77786f] underline underline-offset-2 hover:text-black">
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-4 border-t border-black/10 bg-white px-6 py-5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#717168]">Subtotal</span>
                      <span className="font-semibold">{usdToInrRate === null ? "Price unavailable" : money(cartTotal * usdToInrRate)}</span>
                    </div>
                    <p className="text-xs text-[#77786f]">Shipping and taxes are calculated at checkout.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setCartOpen(false)} className="rounded-full border border-black/20 px-3 py-3.5 text-sm font-semibold transition hover:border-black/50">
                        Continue shopping
                      </button>
                      <button type="button" onClick={startCheckout} disabled={usdToInrRate === null} className="rounded-full bg-[#22231f] px-3 py-3.5 text-sm font-semibold text-white transition hover:bg-[#44463b] disabled:cursor-not-allowed disabled:opacity-50">
                        Buy now
                      </button>
                    </div>
                  </div>
                </>}
          </motion.aside>
        </>}
      </AnimatePresence>

      <section id="story" className="mx-auto grid max-w-[1440px] gap-8 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:items-center lg:gap-20 lg:px-12 lg:py-28">
        <div className="relative min-h-[350px] overflow-hidden rounded-[4px] bg-[#e7e3d9] sm:min-h-[510px]">
          <img src={photo("photo-1518770660439-4636190af475", 1100)} alt="The detailed circuitry inside modern electronics" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 hover:scale-[1.035]" />
          <div className="absolute bottom-4 left-4 bg-[#faf9f6]/90 px-4 py-3 text-[10px] tracking-[0.1em] text-[#45463e]">LESS, BUT BETTER TECH.</div>
        </div>
        <div className="lg:py-10">
          <p className="mb-5 text-[10px] tracking-[0.2em] text-[#7a7b70]">A LITTLE MORE INTENTIONAL</p>
          <h2 className="max-w-xl text-5xl font-medium leading-[0.98] tracking-[-0.075em] sm:text-7xl">Not more tech.<br /><span className="font-serif italic font-normal text-[#758446]">Better tech.</span></h2>
          <p className="mt-7 max-w-lg text-sm leading-7 text-[#6d6e64] sm:text-base sm:leading-8">Find electronics that fit your life, not another spec sheet to sort through. We bring useful design, considered details and everyday tech into one calmer place.</p>
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

      <footer
        className="px-5 pb-8 pt-12 text-white sm:px-8 sm:pt-16 lg:px-12"
        style={{ backgroundImage: "linear-gradient(122deg, #20211e 0%, #293024 53%, #435234 100%)" }}
      >
        <div className="mx-auto max-w-[1440px]">
          <div className="grid gap-10 border-b border-white/15 pb-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
            <div>
              <a href="#" aria-label={`${STORE_NAME} home`}>
                <BrandLogo inverse size="lg" />
              </a>
              <p className="mt-4 max-w-xs text-base font-medium leading-7 text-white/75">
                Thoughtful electronics for everyday life. Discover smartphones, laptops, tablets and accessories in one place.
              </p>
              <div className="mt-6 flex gap-2.5" aria-label="Shop electronics">
                <span title="Smartphones" className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-[#d6ed79] transition duration-200 hover:scale-110 hover:border-[#d6ed79]/70 hover:bg-white/10 hover:shadow-[0_0_18px_rgba(214,237,121,0.18)]"><Smartphone size={18} /></span>
                <span title="Laptops" className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-[#d6ed79] transition duration-200 hover:scale-110 hover:border-[#d6ed79]/70 hover:bg-white/10 hover:shadow-[0_0_18px_rgba(214,237,121,0.18)]"><Laptop size={18} /></span>
                <span title="Audio" className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-[#d6ed79] transition duration-200 hover:scale-110 hover:border-[#d6ed79]/70 hover:bg-white/10 hover:shadow-[0_0_18px_rgba(214,237,121,0.18)]"><Headphones size={18} /></span>
                <span title="Wishlist and shopping bag" className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-[#d6ed79] transition duration-200 hover:scale-110 hover:border-[#d6ed79]/70 hover:bg-white/10 hover:shadow-[0_0_18px_rgba(214,237,121,0.18)]"><ShoppingBag size={18} /></span>
              </div>
            </div>
            <div>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-wide sm:text-base">
                <ArrowUpRight size={16} className="text-[#d6ed79]" /> Explore HI-FI electronics
              </h3>
              <a href="#new-arrivals" className="block py-2 text-sm font-medium text-white/75 transition duration-200 hover:translate-x-1 hover:font-bold hover:text-[#d6ed79]">New arrivals</a>
              <a href="#categories" className="block py-2 text-sm font-medium text-white/75 transition duration-200 hover:translate-x-1 hover:font-bold hover:text-[#d6ed79]">Explore categories</a>
              <a href="#edit" onClick={() => setCategory("all")} className="block py-2 text-sm font-medium text-white/75 transition duration-200 hover:translate-x-1 hover:font-bold hover:text-[#d6ed79]">Shop all electronics</a>
              <a href="#story" className="block py-2 text-sm font-medium text-white/75 transition duration-200 hover:translate-x-1 hover:font-bold hover:text-[#d6ed79]">Our approach</a>
            </div>
            <div>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-wide sm:text-base">
                <Smartphone size={16} className="text-[#d6ed79]" /> Browse by category
              </h3>
              {availableCategories.slice(0, 5).map((item) => (
                <a
                  key={item.slug}
                  href="#edit"
                  onClick={() => navigateToCategory(item.slug)}
                  className="block py-2 text-sm font-medium text-white/75 transition duration-200 hover:translate-x-1 hover:font-bold hover:text-[#d6ed79]"
                >
                  {item.name}
                </a>
              ))}
              {availableCategories.length === 0 && (
                <p className="text-sm font-medium leading-6 text-white/65">Browse the collection as products become available.</p>
              )}
            </div>
            <div>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-wide sm:text-base">
                <MapPin size={16} className="text-[#d6ed79]" /> Visit {STORE_NAME}
              </h3>
              <address className="max-w-xs py-1.5 text-sm font-medium not-italic leading-6 text-white/75">{STORE_ADDRESS}</address>
              <p className="py-1.5 text-sm font-medium leading-6 text-white/75">Thoughtful electronics for everyday life.</p>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-3 pt-6 text-xs font-medium text-white/65 sm:flex-row sm:items-center">
            <span>© 2026 {STORE_NAME}. All rights reserved.</span>
            <span>Website designed, developed and maintained by <strong className="font-bold text-white/85">GLOARO Pvt Ltd</strong>.</span>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {notice && <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} role="status" className="fixed bottom-5 left-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-[#22231f] px-5 py-3.5 text-center text-xs text-white shadow-2xl">{notice}</motion.div>}
      </AnimatePresence>

      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end sm:bottom-6 sm:right-6">
        <AnimatePresence>
          {globotOpen && (
            <motion.section
              role="dialog"
              aria-label="HI-FI shopping assistant"
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              className="mb-4 w-[min(350px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/10 bg-[#faf9f6] shadow-[0_24px_70px_rgba(0,0,0,0.25)]"
            >
              <div className="flex items-center justify-between bg-[#22231f] px-4 py-3.5 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#d6ed79] text-lg">🤖</span>
                  <span><span className="block text-sm font-semibold">HI-FI assistant</span><span className="mt-0.5 block text-[10px] text-white/60">Your shopping sidekick</span></span>
                </div>
                <button type="button" aria-label="Close HI-FI assistant" onClick={() => setGlobotOpen(false)} className="rounded-full p-2 transition hover:bg-white/10"><X size={17} /></button>
              </div>
              <div className="p-4">
                <p className="rounded-xl rounded-tl-sm bg-[#eeefe8] px-3.5 py-3 text-sm leading-5 text-[#41423b]">{globotReply}</p>
                <p className="mb-2 mt-4 text-[10px] font-semibold tracking-[0.12em] text-[#77786f]">QUICK PICKS</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => {
                    setGlobotReply("Great choice! Browse the collection and tap any product to see the details.");
                    setGlobotOpen(false);
                    document.getElementById("edit")?.scrollIntoView({ behavior: "smooth" });
                  }} className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs transition hover:border-[#758446]">Browse electronics</button>
                  <button type="button" onClick={() => setGlobotReply("You'll find our featured tech picks and current product prices in the collection below. Happy exploring!")} className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs transition hover:border-[#758446]">Help me find a deal</button>
                </div>
                <p className="mt-4 text-[10px] leading-4 text-[#92938b]">The HI-FI shopping assistant is a demo.</p>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
        <button
          type="button"
          aria-label={globotOpen ? "Close HI-FI assistant" : "Chat with HI-FI assistant"}
          aria-expanded={globotOpen}
          onClick={() => setGlobotOpen((open) => !open)}
          className={`group relative flex h-[70px] w-[62px] items-end justify-center rounded-[23px] bg-gradient-to-br from-[#d6ed79] via-[#b6d05e] to-[#758446] pb-1.5 shadow-[0_10px_26px_rgba(58,73,27,0.34)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#758446] sm:h-[80px] sm:w-[70px] ${globotOpen ? "" : "globot-jump"}`}
        >
          <span aria-hidden="true" className="absolute -top-1.5 left-1/2 h-3 w-1 -translate-x-1/2 rounded-full bg-[#d6ed79] shadow-[0_0_10px_#d6ed79]">
            <span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#f5ffb5] shadow-[0_0_12px_#d6ed79]" />
          </span>
          <span aria-hidden="true" className="absolute top-[12px] flex h-[34px] w-[44px] items-center justify-center gap-1.5 rounded-[14px] border border-white/70 bg-gradient-to-br from-white via-[#eef3d9] to-[#aebd83] shadow-[inset_0_3px_5px_white,inset_0_-5px_8px_rgba(58,73,27,0.24),0_6px_10px_rgba(34,35,31,0.2)] sm:top-[14px] sm:h-[38px] sm:w-[50px]">
            <span className="h-2 w-2 rounded-full bg-[#22231f] shadow-[0_0_0_2px_rgba(214,237,121,0.85),0_0_8px_#758446] sm:h-2.5 sm:w-2.5" />
            <span className="h-2 w-2 rounded-full bg-[#22231f] shadow-[0_0_0_2px_rgba(214,237,121,0.85),0_0_8px_#758446] sm:h-2.5 sm:w-2.5" />
            <span className="absolute -left-1.5 top-1/2 h-3 w-1.5 -translate-y-1/2 rounded-l-full bg-gradient-to-r from-[#758446] to-[#d6ed79]" />
            <span className="absolute -right-1.5 top-1/2 h-3 w-1.5 -translate-y-1/2 rounded-r-full bg-gradient-to-l from-[#758446] to-[#d6ed79]" />
          </span>
          <span aria-hidden="true" className="absolute bottom-[7px] h-[20px] w-[32px] rounded-t-[10px] rounded-b-[7px] border border-white/40 bg-gradient-to-b from-[#454936] to-[#22231f] shadow-[inset_0_2px_3px_rgba(255,255,255,0.25),0_4px_6px_rgba(34,35,31,0.24)] sm:bottom-[8px] sm:h-[23px] sm:w-[36px]">
            <span className="absolute left-1/2 top-1.5 h-1 w-2.5 -translate-x-1/2 rounded-full bg-[#d6ed79] shadow-[0_0_7px_#d6ed79]" />
          </span>
          <span className="absolute -bottom-1 h-2.5 w-10 rounded-full bg-[#22231f]/15 blur-[3px] transition-all group-hover:w-9" />
          <span className="absolute -left-16 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#22231f] px-3 py-2 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-all group-hover:-left-[4.5rem] group-hover:opacity-100">
            Ask HI-FI
          </span>
        </button>
      </div>
    </main>
  );
}
