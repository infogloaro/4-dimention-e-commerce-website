"use client";

import { useParams } from "next/navigation";
import { useDataQuery } from "@/components/admin/data";
import { ProductForm } from "@/components/admin/product-form";
import { RequirePermission, useAuth } from "@/components/admin/providers";
import { Card, ConfirmDialog, ErrorState, PageHeader, Skeleton, StatusBadge, Btn } from "@/components/admin/ui";
import { useAdminMutation } from "@/components/admin/data";
import { api } from "@/lib/admin/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function EditProductPage() {
  return (
    <RequirePermission anyOf={["product:read"]}>
      <Edit />
    </RequirePermission>
  );
}

function Edit() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const q = useDataQuery<Parameters<typeof ProductForm>[0]["product"] & { name: string; status: string; slug: string }>(["product", id], `/admin/products/${id}`);
  const [archive, setArchive] = useState(false);
  const del = useAdminMutation(() => api.del(`/admin/products/${id}`), { success: "Product archived", onSuccess: () => router.replace("/admin/products") });
  if (q.error) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  if (!q.data) return <div className="space-y-4"><Skeleton className="h-10 w-80" /><Skeleton className="h-72 w-full" /></div>;
  const p = q.data;
  const readOnly = !can("product:write");
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Products", href: "/admin/products" }, { label: p.name }]}
        title={p.name}
        description={`/${p.slug}`}
        actions={<><StatusBadge status={p.status} />{p.status === "ACTIVE" && <a className="text-sm text-indigo-700 underline" href={`/?product=${p.slug}`} target="_blank" rel="noopener noreferrer">View on storefront</a>}{can("product:delete") && p.status !== "ARCHIVED" && <Btn variant="danger" onClick={() => setArchive(true)}>Archive</Btn>}</>}
      />
      {readOnly && <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">You have read-only access to products; saving will be rejected by the server.</p>}
      <ProductForm key={p.id + (q.dataUpdatedAt || 0)} product={p} />
      <ConfirmDialog open={archive} onClose={() => setArchive(false)} busy={del.isPending} danger title={`Archive “${p.name}”?`} confirmLabel="Archive product" onConfirm={() => del.mutate()}
        impact="The product is hidden from the storefront. Existing orders keep their snapshots. It can be restored by setting the status back to Draft or Published." />
    </>
  );
}
