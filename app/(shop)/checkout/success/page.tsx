import { Suspense } from "react";
import type { Metadata } from "next";
import { OrderSuccess } from "@/components/storefront/order-success";

export const metadata: Metadata = { title: "Order confirmation | HI-FI electronics", robots: { index: false } };

export default function Page() {
  return <Suspense><OrderSuccess /></Suspense>;
}
