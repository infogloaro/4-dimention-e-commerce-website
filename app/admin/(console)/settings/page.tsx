"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useAdminMutation, useDataQuery } from "@/components/admin/data";
import { RequirePermission } from "@/components/admin/providers";
import { Badge, Btn, Card, DataTable, Field, Input, Modal, PageHeader, Textarea, Toggle } from "@/components/admin/ui";
import { api } from "@/lib/admin/api";
import { fmtDate } from "@/lib/admin/format";

interface Setting { key: string; value: unknown; isPublic: boolean; updatedAt: string }
const SECRETISH = /(secret|password|passwd|token|api[_-]?key|private)/i;

export default function SettingsPage() {
  return (
    <RequirePermission anyOf={["settings:manage"]}>
      <Settings />
    </RequirePermission>
  );
}

function Settings() {
  const q = useDataQuery<Setting[]>(["settings"], "/admin/settings");
  const [edit, setEdit] = useState<Setting | "new" | null>(null);
  return (
    <>
      <PageHeader
        title="Store settings"
        description="Key/value configuration stored in the database (e.g. store.profile, store.policies). Public settings are served to the storefront. Credentials for payment, shipping, email and storage providers are NOT configured here — they live in server environment variables."
        actions={<Btn variant="primary" onClick={() => setEdit("new")}><Plus className="size-4" /> New setting</Btn>}
      />
      <Card pad={false}>
        <DataTable rows={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} rowKey={(s) => s.key}
          columns={[
            { key: "k", header: "Key", cell: (s) => <span className="font-mono text-sm font-medium">{s.key}</span> },
            { key: "v", header: "Value", cell: (s) => <code className="block max-w-xl truncate text-xs text-slate-600">{JSON.stringify(s.value)}</code> },
            { key: "p", header: "Visibility", cell: (s) => <Badge tone={s.isPublic ? "info" : "neutral"}>{s.isPublic ? "Public" : "Private"}</Badge> },
            { key: "u", header: "Updated", cell: (s) => <span className="text-slate-600">{fmtDate(s.updatedAt)}</span> },
            { key: "a", header: <span className="sr-only">Actions</span>, align: "right", cell: (s) => <Btn size="sm" onClick={() => setEdit(s)}>Edit</Btn> },
          ]} />
      </Card>
      {edit && <SettingModal setting={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function SettingModal({ setting, onClose }: { setting: Setting | null; onClose: () => void }) {
  const [key, setKey] = useState(setting?.key ?? "");
  const [value, setValue] = useState(setting ? JSON.stringify(setting.value, null, 2) : "{}");
  const [isPublic, setPublic] = useState(setting?.isPublic ?? false);
  const [err, setErr] = useState("");
  const m = useAdminMutation((parsed: unknown) => api.put(`/admin/settings/${key}`, { value: parsed, isPublic }), { success: "Setting saved and audited", onSuccess: onClose });
  const submit = () => {
    setErr("");
    if (!/^[a-z0-9_.-]{2,60}$/.test(key)) return setErr("Key: 2–60 chars, lowercase letters, numbers, . _ -");
    if (SECRETISH.test(key) || SECRETISH.test(value)) return setErr("This looks like it contains a secret. Secrets must be set as server environment variables, never stored as settings.");
    try { m.mutate(JSON.parse(value)); } catch { setErr("Value must be valid JSON"); }
  };
  return (
    <Modal open onClose={onClose} title={setting ? `Edit ${setting.key}` : "New setting"} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" loading={m.isPending} onClick={submit}>Save</Btn></>}>
      <div className="space-y-3">
        <Field label="Key" required>{(id) => <Input id={id} value={key} onChange={(e) => setKey(e.target.value)} disabled={!!setting} />}</Field>
        <Field label="Value (JSON)" required error={err}>{(id) => <Textarea id={id} value={value} onChange={(e) => setValue(e.target.value)} className="min-h-40 font-mono text-xs" spellCheck={false} />}</Field>
        <Toggle checked={isPublic} onChange={setPublic} label="Public — served to the storefront and visible to anyone" />
        {isPublic && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">Public settings are readable by every visitor. Don’t put anything confidential here.</p>}
      </div>
    </Modal>
  );
}
