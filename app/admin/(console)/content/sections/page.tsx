"use client";

import { CrudPage, type FieldSpec } from "@/components/admin/crud";
import { Badge } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";

const TYPES = ["HERO", "CATEGORY_RAIL", "PRODUCT_RAIL", "CONTENT_BLOCKS", "COLLECTION", "RECENTLY_VIEWED", "PERSONALIZED", "TRUST_BADGES", "CUSTOM"];
const fields: FieldSpec[] = [
  { key: "key", label: "Key", type: "text", required: true, createOnly: true, half: true, hint: "Unique id, e.g. new-arrivals. Cannot change after creation." },
  { key: "type", label: "Type", type: "select", required: true, half: true, options: TYPES.map((v) => ({ value: v, label: v.replace(/_/g, " ").toLowerCase() })) },
  { key: "title", label: "Title", type: "text", nullable: true, half: true },
  { key: "subtitle", label: "Subtitle", type: "text", nullable: true, half: true },
  { key: "config", label: "Configuration (JSON)", type: "json", hint: "Section-type specific, e.g. {\"placement\":\"home.hero\"} or {\"collection\":\"work-from-anywhere\"}." },
  { key: "startsAt", label: "Show from", type: "datetime", nullable: true, half: true },
  { key: "endsAt", label: "Show until", type: "datetime", nullable: true, half: true },
  { key: "sortOrder", label: "Order", type: "number", half: true },
  { key: "isActive", label: "Active", type: "checkbox" },
];

export default function SectionsPage() {
  return (
    <CrudPage
      title="Homepage sections" description="The ordered sections the storefront home page is composed from (GET /api/v1/home). The existing storefront design is unchanged; sections only supply data." noun="Section"
      readPerms={["content:write"]} writePerm="content:write" listPath="/admin/content/sections" createMethod="PUT"
      itemPath={(id) => `/admin/content/sections/${id}`}
      updateVia={(row, payload) => api.put("/admin/content/sections", { ...payload, key: row.key })}
      fields={fields} deletable
      columns={[
        { key: "sortOrder", header: "#", cell: (r) => String(r.sortOrder) },
        { key: "key", header: "Section", cell: (r) => <div><p className="font-medium">{String(r.title ?? r.key)}</p><p className="font-mono text-xs text-slate-500">{String(r.key)}</p></div> },
        { key: "type", header: "Type", cell: (r) => <Badge tone="accent">{String(r.type).replace(/_/g, " ").toLowerCase()}</Badge> },
        { key: "active", header: "Status", cell: (r) => <Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Live" : "Off"}</Badge> },
      ]}
    />
  );
}
