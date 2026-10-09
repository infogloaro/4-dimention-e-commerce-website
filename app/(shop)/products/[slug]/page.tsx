import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductDetail } from "@/server/services/catalog/product";
import { AppError } from "@/server/core/errors";
import { ProductDetailView } from "@/components/storefront/product-detail";
import type { ProductDetail } from "@/lib/shop/types";

// product data (stock, price) changes with orders — always render fresh, never a stale build-time snapshot
export const dynamic = "force-dynamic";

async function load(slug: string): Promise<ProductDetail | null> {
  try {
    // plain JSON round-trip: Dates become ISO strings exactly as the public API serves them
    return JSON.parse(JSON.stringify(await getProductDetail(slug))) as ProductDetail;
  } catch (e) {
    if (e instanceof AppError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const product = await load((await params).slug);
  if (!product) return { title: "Product not found" };
  return { title: `${product.name} | HI-FI electronics`, description: product.shortDescription ?? undefined };
}

export default async function Page({ params }: PageProps<"/products/[slug]">) {
  const product = await load((await params).slug);
  if (!product) notFound();
  return <ProductDetailView product={product} />;
}
