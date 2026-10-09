"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useAdminMutation, useDataQuery } from "@/components/admin/data";
import { RequirePermission, useAuth } from "@/components/admin/providers";
import { Badge, Btn, Card, DataTable, Field, Input, Modal, PageHeader, Select, StatusBadge } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";
import { fmtDate } from "@/lib/admin/format";

interface Staff { id: string; name: string; email: string; status: string; lastLoginAt: string | null; createdAt: string; role: { key: string; name: string } }
interface RolesRes { roles: { id: string; key: string; name: string; isStaff: boolean }[] }

export default function StaffPage() {
  return (
    <RequirePermission anyOf={["user:manage"]}>
      <StaffList />
    </RequirePermission>
  );
}

function StaffList() {
  const { user, can } = useAuth();
  const q = useDataQuery<Staff[]>(["staff"], "/admin/users");
  const roles = useDataQuery<RolesRes>(["roles"], "/admin/roles");
  const staffRoles = roles.data?.roles.filter((r) => r.isStaff) ?? [];
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<Staff | null>(null);
  const [role, setRole] = useState("");
  const change = useAdminMutation(() => api.patch(`/admin/users/${edit!.id}/role`, { roleKey: role }), { success: "Role changed — the user’s sessions were revoked", onSuccess: () => setEdit(null) });
  return (
    <>
      <PageHeader title="Staff" description="Employees with admin access. Changing a role revokes that person’s sessions immediately so the new permissions apply on next sign-in." actions={<Btn variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> Add staff member</Btn>} />
      <Card pad={false}>
        <DataTable rows={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} rowKey={(s) => s.id}
          columns={[
            { key: "n", header: "Name", cell: (s) => <div><p className="font-medium">{s.name} {s.id === user.id && <Badge tone="accent">you</Badge>}</p><p className="text-xs text-slate-500">{s.email}</p></div> },
            { key: "r", header: "Role", cell: (s) => <Badge tone="accent">{s.role.name}</Badge> },
            { key: "s", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
            { key: "l", header: "Last login", cell: (s) => <span className="text-slate-600">{fmtDate(s.lastLoginAt)}</span> },
            { key: "a", header: <span className="sr-only">Actions</span>, align: "right", cell: (s) => can("user:manage") && s.id !== user.id && <Btn size="sm" onClick={() => { setEdit(s); setRole(s.role.key); }}>Change role</Btn> },
          ]} />
      </Card>
      {creating && <CreateStaff roles={staffRoles} onClose={() => setCreating(false)} />}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Change role · ${edit?.name ?? ""}`} footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn variant="primary" loading={change.isPending} disabled={role === edit?.role.key} onClick={() => change.mutate()}>Change role</Btn></>}>
        <Field label="Role">{(id) => <Select id={id} value={role} onChange={(e) => setRole(e.target.value)}>{staffRoles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</Select>}</Field>
        <p className="mt-3 text-xs text-slate-500">Only super admins can grant or revoke the super admin role. You can’t change your own role.</p>
      </Modal>
    </>
  );
}

function CreateStaff({ roles, onClose }: { roles: RolesRes["roles"]; onClose: () => void }) {
  const [v, setV] = useState({ name: "", email: "", password: "", roleKey: "support_agent" });
  const m = useAdminMutation(() => api.post("/admin/users", v), { success: "Staff account created", onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title="Add staff member" footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" loading={m.isPending} disabled={!v.name || !v.email || v.password.length < 8} onClick={() => m.mutate()}>Create account</Btn></>}>
      <div className="space-y-3">
        <Field label="Full name" required>{(id) => <Input id={id} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
        <Field label="Work email" required>{(id) => <Input id={id} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}</Field>
        <Field label="Temporary password" required hint="At least 8 characters with a letter and a number. Share it securely and ask them to change it.">{(id) => <Input id={id} type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />}</Field>
        <Field label="Role" hint="Least privilege: pick the narrowest role that fits.">{(id) => <Select id={id} value={v.roleKey} onChange={(e) => setV({ ...v, roleKey: e.target.value })}>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</Select>}</Field>
      </div>
    </Modal>
  );
}
