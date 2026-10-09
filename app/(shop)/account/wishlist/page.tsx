import type { Metadata } from "next";
import { WishlistPage } from "@/components/storefront/wishlist-page";

export const metadata: Metadata = { title: "Wishlist | HI-FI electronics", robots: { index: false } };

export default function Page() {
  return <WishlistPage />;
}
