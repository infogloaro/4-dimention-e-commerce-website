"use client";

import { CrudPage, type FieldSpec } from "@/components/admin/crud";
import { useDataQuery } from "@/components/admin/data";
import { Badge } from "@/components/admin/ui";

interface Cat { id: string; name: string; depth: number; path: string }

export default function CategoriesPage() {
  const cats = useDataQuery<Cat[]>(["categories-options"], "/admin/categories");
  const fields: FieldSpec[] = [
    { key: "name", label: "Category name", type: "text", required: true, half: true },
    { key: "slug", label: "Slug", type: "text", half: true },
    { key: "parentId", label: "Parent category", type: "select", nullable: true, half: true, hint: "Moves are cycle-checked by the server.", options: (cats.data ?? []).map((c) => ({ value: c.id, label: `${"— ".repeat(c.depth)}${c.name}` })) },
    { key: "sortOrder", label: "Sort order", type: "number", half: true },
    { key: "description", label: "Description", type: "textarea", nullable: true },
    { key: "imageUrl", label: "Image URL", type: "url", nullable: true, half: true },
    { key: "bannerUrl", label: "Banner URL", type: "url", nullable: true, half: true },
    { key: "iconName", label: "Icon name", type: "text", nullable: true, half: true },
    { key: "seoTitle", label: "SEO title", type: "text", nullable: true, half: true },
    { key: "seoDescription", label: "SEO description", type: "textarea", nullable: true },
    { key: "isActive", label: "Active (visible on storefront)", type: "checkbox" },
    { key: "isFeatured", label: "Featured", type: "checkbox" },
  ];
  return (
    <CrudPage
      key={cats.data?.length ?? 0}
      title="Categories" description="The category tree drives storefront navigation and filters. A category can only be deleted when it has no products or children." noun="Category"
      readPerms={["product:read", "category:write"]} writePerm="category:write" listPath="/admin/categories" itemPath={(id) => `/admin/categories/${id}`}
      fields={fields} deletable
      columns={[
        { key: "name", header: "Category", cell: (r) => <div style={{ paddingLeft: `${Number(r.depth) * 18}px` }}><p className="font-medium">{Number(r.depth) > 0 && "↳ "}{String(r.name)}</p><p className="text-xs text-slate-500">/{String(r.path)}</p></div> },
        { key: "products", header: "Products", align: "right", cell: (r) => Number(r.productCount) },
        { key: "children", header: "Children", align: "right", cell: (r) => Number(r.childCount) },
        { key: "active", header: "Status", cell: (r) => <div className="flex gap-1.5"><Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Active" : "Hidden"}</Badge>{Boolean(r.isFeatured) && <Badge tone="accent">Featured</Badge>}</div> },
      ]}
    />
  );
}
