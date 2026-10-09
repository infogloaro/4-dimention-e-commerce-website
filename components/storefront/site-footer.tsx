import Link from "next/link";
import { ArrowUpRight, Headphones, Laptop, MapPin, ShoppingBag, Smartphone } from "lucide-react";
import BrandLogo from "./brand-logo";
import { STORE_ADDRESS, STORE_NAME } from "@/lib/store-brand";

const icon = "grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-[#d6ed79] transition duration-200 hover:scale-110 hover:border-[#d6ed79]/70 hover:bg-white/10 hover:shadow-[0_0_18px_rgba(214,237,121,0.18)]";
const link = "block py-2 text-sm font-medium text-white/75 transition duration-200 hover:translate-x-1 hover:font-bold hover:text-[#d6ed79]";

const EXPLORE = [
  { label: "New arrivals", href: "/products?sort=newest" },
  { label: "Shop all electronics", href: "/products" },
  { label: "Today's offers", href: "/products?sort=discount" },
  { label: "Track an order", href: "/account/orders" },
];

export function SiteFooter({ categories }: { categories?: { slug: string; name: string }[] }) {
  return (
    <footer className="px-5 pb-8 pt-12 text-white sm:px-8 sm:pt-16 lg:px-12" style={{ backgroundImage: "linear-gradient(122deg, #20211e 0%, #293024 53%, #435234 100%)" }}>
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-10 border-b border-white/15 pb-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" aria-label={`${STORE_NAME} home`}><BrandLogo inverse size="lg" /></Link>
            <p className="mt-4 max-w-xs text-base font-medium leading-7 text-white/75">Thoughtful electronics for everyday life. Discover smartphones, laptops, tablets and accessories in one place.</p>
            <div className="mt-6 flex gap-2.5">
              <Link href="/products?category=smartphones" aria-label="Smartphones" className={icon}><Smartphone size={18} /></Link>
              <Link href="/products?category=laptops" aria-label="Laptops" className={icon}><Laptop size={18} /></Link>
              <Link href="/products?category=audio" aria-label="Audio" className={icon}><Headphones size={18} /></Link>
              <Link href="/cart" aria-label="Shopping bag" className={icon}><ShoppingBag size={18} /></Link>
            </div>
          </div>
          <nav aria-label="Explore">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-wide sm:text-base"><ArrowUpRight size={16} className="text-[#d6ed79]" /> Explore {STORE_NAME}</h3>
            {EXPLORE.map((l) => <Link key={l.label} href={l.href} className={link}>{l.label}</Link>)}
          </nav>
          <nav aria-label="Browse by category">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-wide sm:text-base"><Smartphone size={16} className="text-[#d6ed79]" /> Browse by category</h3>
            {(categories ?? []).slice(0, 5).map((c) => <Link key={c.slug} href={`/products?category=${c.slug}`} className={link}>{c.name}</Link>)}
            {(!categories || categories.length === 0) && <Link href="/products" className={link}>All electronics</Link>}
          </nav>
          <div>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-wide sm:text-base"><MapPin size={16} className="text-[#d6ed79]" /> Visit {STORE_NAME}</h3>
            <address className="max-w-xs py-1.5 text-sm font-medium not-italic leading-6 text-white/75">{STORE_ADDRESS}</address>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 pt-6 text-xs font-medium text-white/65 sm:flex-row sm:items-center">
          <span>© 2026 {STORE_NAME}. All rights reserved.</span>
          <span>Website designed, developed and maintained by <strong className="font-bold text-white/85">GLOARO Pvt Ltd</strong>.</span>
        </div>
      </div>
    </footer>
  );
}
