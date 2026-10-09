"use client";

import { ProductForm } from "@/components/admin/product-form";
import { RequirePermission } from "@/components/admin/providers";
import { PageHeader } from "@/components/admin/ui";

export default function NewProductPage() {
  return (
    <RequirePermission anyOf={["product:write"]}>
      <PageHeader breadcrumbs={[{ label: "Products", href: "/admin/products" }, { label: "New product" }]} title="New product" description="Creates the product, its variants, specifications, images and opening stock in one transaction." />
      <ProductForm />
    </RequirePermission>
  );
}
