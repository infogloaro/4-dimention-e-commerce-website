"use client";

import { CrudPage, type FieldSpec } from "@/components/admin/crud";
import { Badge } from "@/components/admin/ui";

const fields: FieldSpec[] = [
  { key: "name", label: "Brand name", type: "text", required: true, half: true },
  { key: "slug", label: "Slug", type: "text", half: true, hint: "Auto-generated if blank. Lowercase letters, numbers, hyphens." },
  { key: "description", label: "Description", type: "textarea", nullable: true },
  { key: "logoUrl", label: "Logo URL", type: "url", nullable: true, half: true },
  { key: "bannerUrl", label: "Banner URL", type: "url", nullable: true, half: true },
  { key: "websiteUrl", label: "Website", type: "url", nullable: true, half: true },
  { key: "seoTitle", label: "SEO title", type: "text", nullable: true, half: true },
  { key: "seoDescription", label: "SEO description", type: "textarea", nullable: true },
  { key: "isActive", label: "Active (visible on storefront)", type: "checkbox" },
  { key: "isFeatured", label: "Featured", type: "checkbox" },
];

export default function BrandsPage() {
  return (
    <CrudPage
      title="Brands" description="Manufacturers shown in product filters and brand pages." noun="Brand"
      readPerms={["product:read", "brand:write"]} writePerm="brand:write" listPath="/admin/brands" itemPath={(id) => `/admin/brands/${id}`}
      fields={fields} deletable
      columns={[
        { key: "name", header: "Brand", cell: (r) => <div><p className="font-medium">{String(r.name)}</p><p className="text-xs text-slate-500">/{String(r.slug)}</p></div> },
        { key: "products", header: "Products", align: "right", cell: (r) => (r._count as { products: number })?.products ?? 0 },
        { key: "active", header: "Status", cell: (r) => <div className="flex gap-1.5"><Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Active" : "Hidden"}</Badge>{Boolean(r.isFeatured) && <Badge tone="accent">Featured</Badge>}</div> },
      ]}
    />
  );
}
