"use client";

import { CrudPage, type FieldSpec } from "@/components/admin/crud";
import { Badge } from "@/components/admin/ui";
import { fmtDate } from "@/lib/admin/format";

const fields: FieldSpec[] = [
  { key: "type", label: "Type", type: "select", required: true, half: true, options: ["HERO", "BANNER", "PROMO", "CAMPAIGN", "ANNOUNCEMENT"].map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() })) },
  { key: "placement", label: "Placement", type: "text", required: true, half: true, hint: "e.g. home.hero, home.flash, category:audio" },
  { key: "title", label: "Title", type: "text", required: true },
  { key: "subtitle", label: "Subtitle", type: "text", nullable: true },
  { key: "mediaUrl", label: "Image URL", type: "url", nullable: true, half: true },
  { key: "mobileMediaUrl", label: "Mobile image URL", type: "url", nullable: true, half: true },
  { key: "mediaAlt", label: "Image alt text", type: "text", nullable: true },
  { key: "ctaLabel", label: "Button label", type: "text", nullable: true, half: true },
  { key: "ctaUrl", label: "Button link", type: "text", nullable: true, half: true, hint: "Site path (/category/audio) or https URL" },
  { key: "startsAt", label: "Show from", type: "datetime", nullable: true, half: true },
  { key: "endsAt", label: "Show until", type: "datetime", nullable: true, half: true },
  { key: "sortOrder", label: "Order", type: "number", half: true },
  { key: "isActive", label: "Active", type: "checkbox" },
];

export default function BlocksPage() {
  return (
    <CrudPage
      title="Banners & content blocks" description="Hero, promo and announcement blocks served to the storefront by placement. Scheduled blocks appear and expire automatically." noun="Block"
      readPerms={["content:write"]} writePerm="content:write" listPath="/admin/content/blocks" itemPath={(id) => `/admin/content/blocks/${id}`}
      fields={fields} deletable createLabel="New block"
      columns={[
        { key: "title", header: "Block", cell: (r) => <div><p className="font-medium">{String(r.title)}</p><p className="font-mono text-xs text-slate-500">{String(r.placement)}</p></div> },
        { key: "type", header: "Type", cell: (r) => <Badge tone="accent">{String(r.type)}</Badge> },
        { key: "window", header: "Schedule", cell: (r) => <span className="text-xs text-slate-600">{r.startsAt || r.endsAt ? `${fmtDate(r.startsAt as string, false)} → ${fmtDate(r.endsAt as string, false)}` : "Always"}</span> },
        { key: "active", header: "Status", cell: (r) => <Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Live" : "Off"}</Badge> },
      ]}
    />
  );
}
