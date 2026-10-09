import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductsPage } from "@/components/storefront/products-page";
import { ProductGridSkeleton } from "@/components/storefront/product-grid-card";

export const metadata: Metadata = { title: "Shop electronics | HI-FI electronics", description: "Browse smartphones, laptops, audio, monitors and more." };

export default function Page() {
  // useSearchParams() must sit under a Suspense boundary
  return <Suspense fallback={<div className="mx-auto max-w-[1440px] px-5 py-12 sm:px-8 lg:px-12"><ProductGridSkeleton /></div>}><ProductsPage /></Suspense>;
}
