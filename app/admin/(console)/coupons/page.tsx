"use client";

import { useState } from "react";
import { CrudPage, type FieldSpec } from "@/components/admin/crud";
import { useAdminMutation, useDataQuery } from "@/components/admin/data";
import { useAuth } from "@/components/admin/providers";
import { Badge, Btn, DL, ErrorState, Modal, Spinner } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";
import { fmtDate, fmtMoney } from "@/lib/admin/format";

const fields: FieldSpec[] = [
  { key: "code", label: "Code", type: "text", required: true, createOnly: true, half: true, hint: "Letters, numbers, - and _. Cannot change after creation." },
  { key: "type", label: "Discount type", type: "select", required: true, half: true, options: [{ value: "PERCENTAGE", label: "Percentage" }, { value: "FIXED_AMOUNT", label: "Fixed amount" }, { value: "FREE_SHIPPING", label: "Free shipping" }] },
  { key: "value", label: "Value", type: "number", required: true, half: true, hint: "Percent for percentage coupons; paise for fixed amounts (50000 = ₹500). 0 for free shipping." },
  { key: "maxDiscount", label: "Maximum discount (₹)", type: "money", nullable: true, half: true },
  { key: "minSubtotal", label: "Minimum spend (₹)", type: "money", half: true },
  { key: "description", label: "Description", type: "text", nullable: true, half: true },
  { key: "usageLimit", label: "Total usage limit", type: "number", nullable: true, half: true },
  { key: "perUserLimit", label: "Per-customer limit", type: "number", nullable: true, half: true },
  { key: "startsAt", label: "Starts", type: "datetime", nullable: true, half: true },
  { key: "endsAt", label: "Ends", type: "datetime", nullable: true, half: true },
  { key: "isActive", label: "Active", type: "checkbox" },
  { key: "firstOrderOnly", label: "First order only", type: "checkbox" },
  { key: "isStackable", label: "Can stack with other coupons", type: "checkbox" },
  { key: "isPublic", label: "Show publicly as an offer", type: "checkbox" },
];

interface CouponDetail { coupon: { code: string; type: string; value: number; products: unknown[]; categories: unknown[] }; stats: { uses: number; totalDiscount: number; revenueInfluenced: number; uniqueUsers: number; remaining: number | null }; recentRedemptions: { id: string; discountAmount?: number; createdAt?: string; user?: { email: string } }[] }

function Analytics({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useDataQuery<CouponDetail>(["coupon", id], `/admin/coupons/${id}`);
  return (
    <Modal open onClose={onClose} title={q.data ? `Coupon ${q.data.coupon.code} — usage` : "Coupon usage"}>
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data ? <Spinner /> : (
        <div className="space-y-4">
          <DL items={[["Redemptions", q.data.stats.uses], ["Unique customers", q.data.stats.uniqueUsers], ["Total discount given", fmtMoney(q.data.stats.totalDiscount)], ["Revenue influenced", fmtMoney(q.data.stats.revenueInfluenced)], ["Uses remaining", q.data.stats.remaining ?? "Unlimited"], ["Restricted products / categories", `${q.data.coupon.products.length} / ${q.data.coupon.categories.length}`]]} />
          {q.data.recentRedemptions.length > 0 && <div><p className="mb-1 text-xs font-semibold uppercase text-slate-500">Recent redemptions</p><ul className="divide-y divide-slate-100 text-sm">{q.data.recentRedemptions.map((r) => <li key={r.id} className="flex justify-between py-1.5"><span>{r.user?.email ?? "customer"}</span><span className="text-slate-500">{fmtMoney(r.discountAmount)} · {fmtDate(r.createdAt)}</span></li>)}</ul></div>}
        </div>
      )}
    </Modal>
  );
}

export default function CouponsPage() {
  const { can } = useAuth();
  const [usage, setUsage] = useState<string | null>(null);
  const toggle = useAdminMutation((v: { id: string; isActive: boolean }) => api.patch(`/admin/coupons/${v.id}`, { isActive: v.isActive }), { success: "Coupon updated" });
  return (
    <>
      <CrudPage
        title="Coupons" description="Discounts are always calculated by the server pricing engine at cart and checkout; nothing here is trusted from the browser. Product/category restrictions can be set via the API (productIds, categoryIds)." noun="Coupon"
        readPerms={["coupon:read"]} writePerm="coupon:write" listPath="/admin/coupons" itemPath={(id) => `/admin/coupons/${id}`}
        fields={fields} paged searchable deletable
        rowActions={(r) => <>
          <Btn size="sm" variant="ghost" onClick={() => setUsage(r.id)}>Usage</Btn>
          {can("coupon:write") && <Btn size="sm" variant="ghost" onClick={() => toggle.mutate({ id: r.id, isActive: !r.isActive })}>{r.isActive ? "Deactivate" : "Activate"}</Btn>}
        </>}
        columns={[
          { key: "code", header: "Code", cell: (r) => <div><p className="font-mono font-semibold">{String(r.code)}</p><p className="text-xs text-slate-500">{String(r.description ?? "")}</p></div> },
          { key: "value", header: "Discount", cell: (r) => r.type === "PERCENTAGE" ? `${r.value}%` : r.type === "FIXED_AMOUNT" ? fmtMoney(Number(r.value)) : "Free shipping" },
          { key: "min", header: "Min spend", align: "right", cell: (r) => (Number(r.minSubtotal) ? fmtMoney(Number(r.minSubtotal)) : "—") },
          { key: "used", header: "Used", align: "right", cell: (r) => `${r.usedCount}${r.usageLimit ? ` / ${r.usageLimit}` : ""}` },
          { key: "ends", header: "Ends", cell: (r) => fmtDate(r.endsAt as string, false) },
          { key: "active", header: "Status", cell: (r) => <Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Active" : "Inactive"}</Badge> },
        ]}
      />
      {usage && <Analytics id={usage} onClose={() => setUsage(null)} />}
    </>
  );
}
