import type { Metadata } from "next";
import { AdminProviders } from "@/components/admin/providers";

export const metadata: Metadata = {
  title: "4D Commerce Admin",
  description: "Operations console for 4D Commerce",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <AdminProviders>{children}</AdminProviders>;
}
