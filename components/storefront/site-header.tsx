"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Heart, LogOut, Menu, Package, Search, ShoppingBag, User, X, Zap } from "lucide-react";
import BrandLogo from "./brand-logo";
import { useShop } from "./shop-provider";
import { STORE_NAME } from "@/lib/store-brand";

const NAV = [
  { label: "Shop electronics", href: "/products" },
  { label: "Categories", href: "/#categories" },
  { label: "Offers", href: "/products?sort=discount" },
  { label: "Our story", href: "/#story" },
];

const navLink = "rounded-xl border border-transparent px-3.5 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/80 hover:bg-[#d6ed79] hover:text-[#22231f] hover:shadow-[inset_1px_1px_3px_rgba(255,255,255,0.75),0_3px_8px_rgba(94,112,48,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#758446]";

export function SiteHeader() {
  const router = useRouter();
  const { user, authReady, cartCount, openCart, wishlist, signOut } = useShop();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) { if (e.key === "Escape") setAccountOpen(false); return; }
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", close); };
  }, [accountOpen]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    setMenuOpen(false);
    router.push(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
  };

  return (
    <>
      <div className="flex min-h-9 items-center justify-center gap-2 bg-[#22231f] px-4 py-2 text-center text-[10px] tracking-[0.16em] text-white sm:text-[11px]">
        <Zap size={12} className="text-[#d6ed79]" aria-hidden />
        <span>THE NEXT WAY TO SHOP</span>
        <span className="hidden text-white/40 sm:inline">·</span>
        <span className="hidden sm:inline">Thoughtful finds. Better everyday.</span>
      </div>
      <header className="sticky top-0 z-40 border-b border-black/10 bg-[#faf9f6]/90 shadow-md backdrop-blur-xl">
        <div className="mx-auto flex h-[70px] max-w-[1440px] items-center justify-between gap-5 px-5 sm:px-8 lg:px-12">
          <button aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="rounded-full p-2 transition hover:bg-black/5 lg:hidden">
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
          <Link href="/" aria-label={`${STORE_NAME} home`} className="shrink-0"><BrandLogo /></Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-1 text-sm font-semibold text-[#4d5832] lg:flex">
            {NAV.map((item) => <Link key={item.label} href={item.href} className={navLink}>{item.label}</Link>)}
          </nav>
          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-3">
            <form onSubmit={search} role="search" className="hidden h-10 w-44 items-center gap-2 rounded-full border border-black/10 bg-white/60 px-3 xl:flex">
              <Search size={15} className="shrink-0 text-[#77786f]" aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find something..." aria-label="Search products" className="w-full bg-transparent text-xs outline-none placeholder:text-[#8c8c83]" />
            </form>
            <Link href="/products" aria-label="Search products" className="rounded-full p-2 transition hover:bg-black/5 xl:hidden"><Search size={19} /></Link>
            <Link href="/account/wishlist" aria-label={`Wishlist${wishlist.size ? `, ${wishlist.size} saved` : ""}`} className="relative rounded-full p-2 transition hover:bg-black/5">
              <Heart size={19} strokeWidth={1.6} />
              {wishlist.size > 0 && <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d6ed79] px-1 text-[9px]">{wishlist.size}</span>}
            </Link>
            <div ref={accountRef} className="relative">
              {authReady && !user ? (
                <Link href="/login" className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition hover:bg-black/5 sm:flex"><User size={16} aria-hidden /> Sign in</Link>
              ) : (
                <button type="button" aria-haspopup="menu" aria-expanded={accountOpen} aria-label="Account menu" onClick={() => setAccountOpen((o) => !o)} className="flex items-center gap-1.5 rounded-full p-2 text-xs font-semibold transition hover:bg-black/5">
                  <User size={19} strokeWidth={1.6} aria-hidden />{user && <span className="hidden max-w-[7rem] truncate sm:inline">{user.name.split(" ")[0]}</span>}
                </button>
              )}
              {accountOpen && user && (
                <div role="menu" className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-xl border border-black/10 bg-white py-1 text-sm shadow-xl">
                  <p className="truncate border-b border-black/5 px-4 py-2.5 text-xs text-[#77786f]">{user.email}</p>
                  <Link role="menuitem" href="/account/orders" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 px-4 py-2.5 hover:bg-[#f3f2ec]"><Package size={15} aria-hidden /> My orders</Link>
                  <Link role="menuitem" href="/account/wishlist" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 px-4 py-2.5 hover:bg-[#f3f2ec]"><Heart size={15} aria-hidden /> Wishlist</Link>
                  {user.isStaff && <Link role="menuitem" href="/admin" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 px-4 py-2.5 hover:bg-[#f3f2ec]"><ArrowUpRight size={15} aria-hidden /> Admin console</Link>}
                  <button role="menuitem" type="button" onClick={() => { setAccountOpen(false); void signOut().then(() => router.push("/")); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-[#f3f2ec]"><LogOut size={15} aria-hidden /> Sign out</button>
                </div>
              )}
            </div>
            <button onClick={openCart} aria-label={`Shopping bag with ${cartCount} items`} className="relative flex items-center gap-2 rounded-full bg-[#22231f] px-3 py-2.5 text-white transition hover:bg-[#44463b]">
              <ShoppingBag size={16} strokeWidth={1.7} /><span className="hidden text-xs sm:inline">Bag</span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d6ed79] px-1 text-[10px] font-semibold text-[#22231f]">{cartCount}</span>
            </button>
          </div>
        </div>
        <AnimatePresence>
          {menuOpen && (
            <motion.nav aria-label="Mobile navigation" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-black/5 bg-[#faf9f6] px-6 lg:hidden">
              <form onSubmit={search} role="search" className="my-4"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search electronics..." aria-label="Search products" className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[#85964b]" /></form>
              {NAV.map((item) => (
                <Link key={item.label} href={item.href} onClick={() => setMenuOpen(false)} className="mb-2 flex items-center justify-between rounded-xl border border-white/80 bg-gradient-to-br from-[#f1f6df] to-[#dce8b6] px-4 py-3 text-sm font-semibold text-[#4d5832] shadow-[inset_2px_2px_5px_rgba(120,139,70,0.12),inset_-2px_-2px_5px_rgba(255,255,255,0.85),0_3px_8px_rgba(94,112,48,0.1)] transition hover:bg-[#d6ed79] hover:text-[#22231f]">{item.label}<ArrowUpRight size={16} /></Link>
              ))}
              {authReady && !user && <Link href="/login" onClick={() => setMenuOpen(false)} className="mb-4 flex items-center justify-between rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold">Sign in or create an account<User size={16} /></Link>}
            </motion.nav>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
