"use client";

import { useMemo, useState } from "react";
import { useAdminMutation, useDataQuery } from "@/components/admin/data";
import { RequirePermission, useAuth } from "@/components/admin/providers";
import { Badge, Btn, Card, ConfirmDialog, ErrorState, PageHeader, Select, Spinner } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";

interface RolesRes { roles: { id: string; key: string; name: string; description: string | null; isSystem: boolean; isStaff: boolean; userCount: number; permissions: string[] }[]; permissions: string[] }

export default function RolesPage() {
  return (
    <RequirePermission anyOf={["user:manage", "role:manage"]}>
      <Roles />
    </RequirePermission>
  );
}

function Roles() {
  const { can } = useAuth();
  const canEdit = can("role:manage");
  const q = useDataQuery<RolesRes>(["roles"], "/admin/roles");
  const [roleId, setRoleId] = useState("");
  const [edits, setEdits] = useState<{ id: string; perms: Set<string> } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const roles = q.data?.roles;
  const role = roles?.find((r) => r.id === roleId) ?? roles?.find((r) => r.key === "manager") ?? roles?.[0];
  const draft = useMemo(() => (edits && role && edits.id === role.id ? edits.perms : new Set(role?.permissions ?? [])), [edits, role]);
  const setDraft = (perms: Set<string>) => role && setEdits({ id: role.id, perms });
  const protectedRole = !role || role.key === "super_admin" || role.key === "customer";
  const dirty = !!role && (draft.size !== role.permissions.length || role.permissions.some((p) => !draft.has(p)));
  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const p of q.data?.permissions ?? []) (g[p.split(":")[0]] ??= []).push(p);
    return Object.entries(g);
  }, [q.data]);
  const save = useAdminMutation(() => api.put(`/admin/roles/${role!.id}/permissions`, { permissions: [...draft] }), { success: "Permissions updated and audited", onSuccess: () => { setConfirm(false); setEdits(null); } });

  if (q.error) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  if (!q.data || !role) return <Spinner />;
  return (
    <>
      <PageHeader title="Roles & permissions" description="Permissions are enforced by the API on every request; this matrix edits what each role is granted. Changes apply within ~30 s (cache) and are audited with before/after." actions={<Select aria-label="Role" value={role.id} onChange={(e) => setRoleId(e.target.value)} className="w-56">{roles!.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>} />
      <Card title={<span className="flex items-center gap-2">{role.name} <Badge>{role.userCount} user(s)</Badge>{role.isSystem && <Badge tone="info">system role</Badge>}</span>} actions={canEdit && !protectedRole && <Btn variant="primary" disabled={!dirty} onClick={() => setConfirm(true)}>Save permissions</Btn>}>
        {role.description && <p className="mb-4 text-sm text-slate-600">{role.description}</p>}
        {protectedRole && <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">{role.key === "super_admin" ? "The super admin role is unrestricted and can’t be edited." : "Customers have no admin permissions."}</p>}
        {!canEdit && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">View only — editing permissions requires the role:manage permission (super admin).</p>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map(([g, perms]) => (
            <fieldset key={g} className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</legend>
              {perms.map((p) => (
                <label key={p} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" className="accent-indigo-600" checked={role.key === "super_admin" || draft.has(p)} disabled={!canEdit || protectedRole} onChange={(e) => { const n = new Set(draft); if (e.target.checked) n.add(p); else n.delete(p); setDraft(n); }} />
                  <span className="font-mono text-xs">{p}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </Card>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} busy={save.isPending} title={`Update “${role.name}” permissions?`} confirmLabel="Apply" onConfirm={() => save.mutate()}
        impact={`${role.userCount} user(s) with this role will gain or lose access. Granting order:refund, settings:manage or user:manage deserves extra care.`}
        description={<p>{[...draft].filter((p) => !role.permissions.includes(p)).length} added · {role.permissions.filter((p) => !draft.has(p)).length} removed.</p>} />
    </>
  );
}
