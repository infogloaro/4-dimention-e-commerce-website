import type { Metadata } from "next";
import { AccountOrderDetail } from "@/components/storefront/account-order-detail";

export const metadata: Metadata = { title: "Order details | HI-FI electronics", robots: { index: false } };

export default async function Page({ params }: PageProps<"/account/orders/[id]">) {
  return <AccountOrderDetail id={(await params).id} />;
}
