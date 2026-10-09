import { StoreShell } from "@/components/storefront/store-shell";

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return <StoreShell>{children}</StoreShell>;
}
