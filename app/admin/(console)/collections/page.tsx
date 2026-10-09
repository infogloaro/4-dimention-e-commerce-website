"use client";

import { CrudPage, type FieldSpec } from "@/components/admin/crud";
import { Badge } from "@/components/admin/ui";
import { fmtDate } from "@/lib/admin/format";

const fields: FieldSpec[] = [
  { key: "name", label: "Collection name", type: "text", required: true, half: true },
  { key: "slug", label: "Slug", type: "text", half: true },
  { key: "description", label: "Description", type: "textarea", nullable: true },
  { key: "imageUrl", label: "Image URL", type: "url", nullable: true, half: true },
  { key: "bannerUrl", label: "Banner URL", type: "url", nullable: true, half: true },
  { key: "startsAt", label: "Visible from", type: "datetime", nullable: true, half: true, hint: "Leave blank to publish immediately." },
  { key: "endsAt", label: "Visible until", type: "datetime", nullable: true, half: true },
  { key: "sortOrder", label: "Sort order", type: "number", half: true },
  { key: "isActive", label: "Active", type: "checkbox" },
  { key: "isFeatured", label: "Featured", type: "checkbox" },
];

export default function CollectionsPage() {
  return (
    <CrudPage
      title="Collections" description="Curated product groups with optional schedule windows. Product membership is set per collection via the API (productIds)." noun="Collection"
      readPerms={["product:read", "collection:write"]} writePerm="collection:write" listPath="/admin/collections" itemPath={(id) => `/admin/collections/${id}`}
      fields={fields} deletable
      columns={[
        { key: "name", header: "Collection", cell: (r) => <div><p className="font-medium">{String(r.name)}</p><p className="text-xs text-slate-500">/{String(r.slug)}</p></div> },
        { key: "products", header: "Products", align: "right", cell: (r) => (r._count as { products: number })?.products ?? 0 },
        { key: "window", header: "Schedule", cell: (r) => <span className="text-xs text-slate-600">{r.startsAt || r.endsAt ? `${fmtDate(r.startsAt as string, false)} → ${fmtDate(r.endsAt as string, false)}` : "Always"}</span> },
        { key: "active", header: "Status", cell: (r) => <Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Active" : "Hidden"}</Badge> },
      ]}
    />
  );
}
