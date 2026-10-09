import type { Metadata } from "next";
import { CartPage } from "@/components/storefront/cart-page";

export const metadata: Metadata = { title: "Your bag | HI-FI electronics" };

export default function Page() {
  return <CartPage />;
}
