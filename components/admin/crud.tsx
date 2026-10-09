"use client";

import { Plus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { ApiError, api, type Query } from "@/lib/admin/api";
import { minorToRupees, rupeesToMinor } from "@/lib/admin/format";
import { useAdminMutation, usePagedQuery } from "./data";
import { useAuth, RequirePermission } from "./providers";
import { Btn, Card, ConfirmDialog, DataTable, Field, FilterBar, Input, Modal, PageHeader, Pagination, SearchBox, Select, Textarea, Toggle, useUrlState, type Column } from "./ui";

export type FieldType = "text" | "textarea" | "number" | "money" | "checkbox" | "select" | "date" | "datetime" | "list" | "json" | "url";
export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  options?: { value: string; label: string }[];
  /** On edit, send null when cleared (for nullable API fields). */
  nullable?: boolean;
  /** Only on create (e.g. immutable codes). */
  createOnly?: boolean;
  half?: boolean;
}

type Row = Record<string, unknown> & { id: string };
type Values = Record<string, string | boolean>;

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(iso: unknown, withTime: boolean) {
  if (!iso || typeof iso !== "string") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

export function initialValues(fields: FieldSpec[], row?: Row | null): Values {
  const v: Values = {};
  for (const f of fields) {
    const raw = row?.[f.key];
    if (f.type === "checkbox") v[f.key] = row ? Boolean(raw) : false;
    else if (f.type === "money") v[f.key] = minorToRupees(raw as number | null);
    else if (f.type === "date" || f.type === "datetime") v[f.key] = toLocalInput(raw, f.type === "datetime");
    else if (f.type === "list") v[f.key] = Array.isArray(raw) ? (raw as string[]).join(", ") : "";
    else if (f.type === "json") v[f.key] = raw === undefined || raw === null ? "" : JSON.stringify(raw, null, 2);
    else v[f.key] = raw === undefined || raw === null ? "" : String(raw);
  }
  return v;
}

/** Converts form values to an API payload; returns per-field errors instead when something is invalid. */
export function buildPayload(fields: FieldSpec[], values: Values, editing: boolean): { payload?: Record<string, unknown>; errors?: Record<string, string> } {
  const payload: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (editing && f.createOnly) continue;
    const raw = values[f.key];
    if (f.type === "checkbox") { payload[f.key] = Boolean(raw); continue; }
    const s = String(raw ?? "").trim();
    if (s === "") {
      if (f.required) errors[f.key] = `${f.label} is required`;
      else if (editing && f.nullable) payload[f.key] = null;
      continue;
    }
    switch (f.type) {
      case "number": { const n = Number(s); if (!Number.isFinite(n)) errors[f.key] = "Enter a number"; else payload[f.key] = n; break; }
      case "money": { const m = rupeesToMinor(s); if (m === null) errors[f.key] = "Enter a valid amount"; else payload[f.key] = m; break; }
      case "date": case "datetime": { const d = new Date(s); if (Number.isNaN(d.getTime())) errors[f.key] = "Invalid date"; else payload[f.key] = d.toISOString(); break; }
      case "list": payload[f.key] = s.split(",").map((x) => x.trim()).filter(Boolean); break;
      case "json": { try { payload[f.key] = JSON.parse(s); } catch { errors[f.key] = "Must be valid JSON"; } break; }
      default: payload[f.key] = s;
    }
  }
  return Object.keys(errors).length ? { errors } : { payload };
}

export function FormFields({ fields, values, setValues, errors, editing }: { fields: FieldSpec[]; values: Values; setValues: (v: Values) => void; errors: Record<string, string>; editing: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.filter((f) => !(editing && f.createOnly && false)).map((f) => {
        const set = (x: string | boolean) => setValues({ ...values, [f.key]: x });
        const disabled = editing && f.createOnly;
        const wide = f.type === "textarea" || f.type === "json" || f.type === "list" || !f.half;
        if (f.type === "checkbox") return <div key={f.key} className="flex items-end pb-1"><Toggle checked={Boolean(values[f.key])} onChange={set} label={f.label} /></div>;
        return (
          <div key={f.key} className={wide && (f.type === "textarea" || f.type === "json" || f.type === "list") ? "sm:col-span-2" : ""}>
            <Field label={f.label} required={f.required} hint={f.hint} error={errors[f.key]}>
              {(id) => {
                const v = String(values[f.key] ?? "");
                switch (f.type) {
                  case "textarea": return <Textarea id={id} value={v} onChange={(e) => set(e.target.value)} />;
                  case "json": return <Textarea id={id} value={v} onChange={(e) => set(e.target.value)} className="font-mono text-xs" spellCheck={false} />;
                  case "select": return <Select id={id} value={v} onChange={(e) => set(e.target.value)} disabled={disabled}>{!f.required && <option value="">—</option>}{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
                  case "number": return <Input id={id} type="number" value={v} onChange={(e) => set(e.target.value)} disabled={disabled} />;
                  case "money": return <Input id={id} inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} placeholder="₹" />;
                  case "date": return <Input id={id} type="date" value={v} onChange={(e) => set(e.target.value)} />;
                  case "datetime": return <Input id={id} type="datetime-local" value={v} onChange={(e) => set(e.target.value)} />;
                  case "url": return <Input id={id} type="url" value={v} onChange={(e) => set(e.target.value)} />;
                  default: return <Input id={id} value={v} onChange={(e) => set(e.target.value)} disabled={disabled} />;
                }
              }}
            </Field>
          </div>
        );
      })}
    </div>
  );
}

/** Create / edit dialog driven by field specs; maps server validation errors back onto fields. */
export function RecordFormModal({ open, onClose, title, fields, row, onSubmit, busy, serverError, wide = true, children }: {
  open: boolean; onClose: () => void; title: string; fields: FieldSpec[]; row?: Row | null; busy?: boolean; wide?: boolean; children?: ReactNode;
  onSubmit: (payload: Record<string, unknown>) => void; serverError?: unknown;
}) {
  const editing = !!row;
  const [values, setValues] = useState<Values>(() => initialValues(fields, row));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fieldErrors = useMemo(() => {
    const out: Record<string, string> = { ...errors };
    if (serverError instanceof ApiError) for (const f of serverError.details?.fields ?? []) out[f.path.split(".")[0]] ??= f.message;
    return out;
  }, [errors, serverError]);
  return (
    <Modal open={open} onClose={onClose} title={title} wide={wide} footer={<>
      <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" loading={busy} onClick={() => { const r = buildPayload(fields, values, editing); setErrors(r.errors ?? {}); if (r.payload) onSubmit(r.payload); }}>{editing ? "Save changes" : "Create"}</Btn>
    </>}>
      <FormFields fields={fields} values={values} setValues={setValues} errors={fieldErrors} editing={editing} />
      {serverError instanceof ApiError && !serverError.details?.fields?.length ? <p role="alert" className="mt-3 text-sm text-rose-600">{serverError.message}</p> : null}
      {children}
    </Modal>
  );
}

export interface CrudProps {
  title: string;
  description: string;
  noun: string;
  readPerms: string[];
  writePerm: string;
  listPath: string;
  /** Item endpoint for PATCH/DELETE. */
  itemPath: (id: string) => string;
  createMethod?: "POST" | "PUT";
  /** Override how an existing row is saved (e.g. upsert-by-key endpoints). */
  updateVia?: (row: Row, payload: Record<string, unknown>) => Promise<unknown>;
  fields: FieldSpec[];
  columns: Column<Row>[];
  searchable?: boolean;
  /** Static extra query params. */
  query?: Query;
  paged?: boolean;
  deletable?: boolean;
  /** Called with the saved row so the page can e.g. show a coupon's analytics. */
  rowActions?: (row: Row, refresh: () => void) => ReactNode;
  filterSlot?: ReactNode;
  headerActions?: ReactNode;
  createLabel?: string;
}

export function CrudPage(p: CrudProps) {
  return (
    <RequirePermission anyOf={p.readPerms}>
      <Crud {...p} />
    </RequirePermission>
  );
}

function Crud(p: CrudProps) {
  const { can } = useAuth();
  const canWrite = can(p.writePerm);
  const [f, set] = useUrlState({ search: "", page: "1" });
  const q = usePagedQuery<Row>(p.noun, p.listPath, { ...p.query, search: p.searchable ? f.search : undefined, page: p.paged ? Number(f.page) : undefined, pageSize: p.paged ? 20 : undefined });
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [formKey, setFormKey] = useState(0);

  const save = useAdminMutation((payload: Record<string, unknown>) => {
    if (editing === "new") return p.createMethod === "PUT" ? api.put(p.listPath, payload) : api.post(p.listPath, payload);
    if (p.updateVia) return p.updateVia(editing as Row, payload);
    return api.patch(p.itemPath((editing as Row).id), payload);
  }, { success: `${p.noun} saved`, onSuccess: () => setEditing(null) });
  const del = useAdminMutation(() => api.del(p.itemPath(deleting!.id)), { success: `${p.noun} deleted`, onSuccess: () => setDeleting(null) });

  const rows = q.rows;
  const columns: Column<Row>[] = [
    ...p.columns,
    ...(canWrite ? [{ key: "_a", header: <span className="sr-only">Actions</span>, align: "right" as const, cell: (r: Row) => (
      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        {p.rowActions?.(r, () => q.refetch())}
        <Btn size="sm" onClick={() => { setFormKey((k) => k + 1); save.reset(); setEditing(r); }}>Edit</Btn>
        {p.deletable && <Btn size="sm" variant="ghost" className="text-rose-600" onClick={() => setDeleting(r)}>Delete</Btn>}
      </div>
    ) }] : []),
  ];

  return (
    <>
      <PageHeader
        title={p.title}
        description={p.description}
        actions={<>{p.headerActions}{canWrite && <Btn variant="primary" onClick={() => { setFormKey((k) => k + 1); save.reset(); setEditing("new"); }}><Plus className="size-4" /> {p.createLabel ?? `New ${p.noun.toLowerCase()}`}</Btn>}</>}
      />
      <Card pad={false}>
        {(p.searchable || p.filterSlot) && <FilterBar>{p.searchable && <SearchBox value={f.search} onChange={(v) => set({ search: v })} />}{p.filterSlot}</FilterBar>}
        <DataTable rows={rows} loading={q.isLoading || q.isFetching} error={q.error} onRetry={() => q.refetch()} rowKey={(r) => r.id} columns={columns} pageSize={p.paged ? 20 : 8} />
        {p.paged && <Pagination meta={q.meta} onPage={(n) => set({ page: String(n) }, false)} />}
      </Card>
      {editing && (
        <RecordFormModal key={formKey} open onClose={() => setEditing(null)} title={editing === "new" ? `New ${p.noun.toLowerCase()}` : `Edit ${p.noun.toLowerCase()}`} fields={p.fields} row={editing === "new" ? null : editing} busy={save.isPending} serverError={save.error} onSubmit={(payload) => save.mutate(payload)} />
      )}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} busy={del.isPending} danger title={`Delete ${p.noun.toLowerCase()}?`} confirmLabel="Delete" onConfirm={() => del.mutate()}
        description={<>This removes <strong>{String(deleting?.name ?? deleting?.title ?? deleting?.code ?? deleting?.key ?? "this record")}</strong>. The deletion is audited.</>} />
    </>
  );
}
