import type { Metadata } from "next";
import { AccountOrders } from "@/components/storefront/account-orders";

export const metadata: Metadata = { title: "Your orders | HI-FI electronics", robots: { index: false } };

export default function Page() {
  return <AccountOrders />;
}
