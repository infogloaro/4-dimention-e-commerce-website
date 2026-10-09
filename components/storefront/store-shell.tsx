"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShopProvider, useShop } from "./shop-provider";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { CartDrawer } from "./cart-drawer";
import { leafCategories, useCategories } from "@/lib/shop/hooks";

function Toast() {
  const { notice } = useShop();
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-5 left-1/2 z-[80] -translate-x-1/2">
      <AnimatePresence>
        {notice && <motion.div key={notice} initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} className="max-w-[calc(100vw-2rem)] rounded-full bg-[#22231f] px-5 py-3.5 text-center text-xs text-white shadow-2xl">{notice}</motion.div>}
      </AnimatePresence>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const categories = leafCategories(useCategories());
  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#20211e]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg">Skip to content</a>
      <SiteHeader />
      <main id="main" className="overflow-clip">{children}</main>
      <SiteFooter categories={categories} />
      <CartDrawer />
      <Toast />
    </div>
  );
}

export function StoreShell({ children }: { children: ReactNode }) {
  return <ShopProvider><Frame>{children}</Frame></ShopProvider>;
}
