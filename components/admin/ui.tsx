"use client";

import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Loader2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { errorMessage, type PageMeta } from "@/lib/admin/api";
import { toneFor, titleCase, type Tone } from "@/lib/admin/format";
import { statusLabel, statusTone, type StatusKind } from "@/lib/order-status";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ───────────── buttons & badges ───────────── */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm disabled:bg-indigo-300",
  secondary: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-slate-700 hover:bg-slate-100 disabled:text-slate-400",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm disabled:bg-rose-300",
};
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: "sm" | "md";
  loading?: boolean;
}
export const Btn = forwardRef<HTMLButtonElement, ButtonProps>(function Btn({ variant = "secondary", size = "md", loading, disabled, className, children, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed", size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm", BTN[variant], className)}
      {...rest}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkBtn({ href, children, variant = "secondary", size = "md", className }: { href: string; children: ReactNode; variant?: BtnVariant; size?: "sm" | "md"; className?: string }) {
  return (
    <Link href={href} className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500", size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm", BTN[variant], className)}>
      {children}
    </Link>
  );
}

const TONE: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  accent: "bg-indigo-50 text-indigo-700 ring-indigo-200",
};
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONE[tone], className)}>{children}</span>;
}
/** `kind` selects the state machine (order / payment / shipment / return / refund) so the label matches what customers see. */
export const StatusBadge = ({ status, kind }: { status: string | null | undefined; kind?: StatusKind }) => (status ? <Badge tone={(kind && statusTone(status, kind)) || toneFor(status)}>{kind ? statusLabel(status, kind) : titleCase(status)}</Badge> : <span className="text-slate-400">—</span>);

/* ───────────── layout bits ───────────── */
export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions, breadcrumbs }: { title: string; description?: string; actions?: ReactNode; breadcrumbs?: { label: string; href?: string }[] }) {
  return (
    <div className="mb-5">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" aria-hidden />}
              {b.href ? <Link href={b.href} className="hover:text-slate-900 hover:underline">{b.label}</Link> : <span aria-current="page" className="text-slate-700">{b.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {description && <p className="mt-0.5 max-w-3xl text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-slate-200/70", className)} />;
}
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}…
    </div>
  );
}
export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="text-slate-400">{icon ?? <Inbox className="size-8" aria-hidden />}</div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="max-w-sm text-xs text-slate-500">{hint}</p>}
      {action}
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = (error as { status?: number })?.status;
  const rid = (error as { requestId?: string })?.requestId;
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <AlertTriangle className="size-7 text-rose-500" aria-hidden />
      <p className="text-sm font-medium text-slate-800">{status === 403 ? "You don’t have permission to view this." : "Couldn’t load this data."}</p>
      <p className="max-w-md text-xs text-slate-500">{errorMessage(error)}</p>
      {rid && <p className="font-mono text-[11px] text-slate-400">Request {rid}</p>}
      {onRetry && status !== 403 && <Btn size="sm" onClick={onRetry}>Retry</Btn>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "neutral", href, loading }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; href?: string; loading?: boolean }) {
  const inner = (
    <div className={cx("rounded-xl border bg-white p-4 shadow-sm transition-shadow", href && "hover:shadow-md", tone === "danger" ? "border-rose-200" : tone === "warning" ? "border-amber-200" : "border-slate-200")}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      {loading ? <Skeleton className="mt-2 h-7 w-24" /> : <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>}
      {hint && !loading && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-indigo-500">{inner}</Link> : inner;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors", value === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800")}>
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ───────────── form controls ───────────── */
const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-200 disabled:bg-slate-50 disabled:text-slate-500";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(inputCls, "h-9", className)} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return <select ref={ref} className={cx(inputCls, "h-9 pr-8", className)} {...p}>{children}</select>;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx(inputCls, "min-h-20", className)} {...p} />;
});
export function Field({ label, hint, error, children, required }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode; required?: boolean }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label} {required && <span className="text-rose-500" aria-hidden>*</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4 rounded border-slate-300 accent-indigo-600" />
      {label}
    </label>
  );
}

/* ───────────── dialogs (native <dialog>: focus trap + Esc for free) ───────────── */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} className={cx("m-auto w-[calc(100%-2rem)] rounded-2xl p-0 shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-[1px]", wide ? "max-w-3xl" : "max-w-lg")}>
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <button aria-label="Close dialog" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X className="size-4" /></button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** Confirmation for sensitive actions; optionally collects a mandatory reason (used by audit-logged operations). */
export function ConfirmDialog(p: ConfirmProps) {
  return p.open ? <ConfirmInner {...p} /> : null;
}

type ConfirmProps = Parameters<typeof ConfirmInner>[0];
function ConfirmInner({ open, onClose, onConfirm, title, description, impact, confirmLabel = "Confirm", danger, reasonLabel, reasonMin = 3, busy, confirmDisabled }: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => void | Promise<void>; title: string; description?: ReactNode; impact?: ReactNode;
  confirmLabel?: string; danger?: boolean; reasonLabel?: string; reasonMin?: number; busy?: boolean; confirmDisabled?: boolean;
}) {
  const [reason, setReason] = useState("");
  const invalid = !!reasonLabel && reason.trim().length < reasonMin;
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<>
      <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
      <Btn variant={danger ? "danger" : "primary"} loading={busy} disabled={invalid || confirmDisabled} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Btn>
    </>}>
      <div className="space-y-3 text-sm text-slate-700">
        {description && <div>{description}</div>}
        {impact && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><strong className="font-semibold">Impact: </strong>{impact}</div>}
        {reasonLabel && <Field label={reasonLabel} required>{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}</Field>}
      </div>
    </Modal>
  );
}

/* ───────────── toasts ───────────── */
interface Toast { id: number; tone: "success" | "error" | "info"; text: string }
const ToastCtx = createContext<{ push: (tone: Toast["tone"], text: string) => void }>({ push: () => {} });
export const useToast = () => {
  const { push } = useContext(ToastCtx);
  return useMemo(() => ({ success: (t: string) => push("success", t), error: (t: string) => push("error", t), info: (t: string) => push("info", t), fail: (e: unknown) => push("error", errorMessage(e)) }), [push]);
};
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-3), { id, tone, text }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), tone === "error" ? 8000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={cx("pointer-events-auto flex items-start gap-2 rounded-lg border bg-white p-3 text-sm shadow-lg", t.tone === "error" ? "border-rose-200" : t.tone === "success" ? "border-emerald-200" : "border-slate-200")}>
            {t.tone === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-500" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />}
            <span className="text-slate-800">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ───────────── URL-backed filter state ───────────── */
/** Filters live in the query string so they survive navigation to a detail page and back. */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const state = useMemo(() => {
    const o: Record<string, string> = { ...defaults };
    for (const k of Object.keys(defaults)) o[k] = sp.get(k) ?? defaults[k];
    return o as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
  const set = useCallback((patch: Partial<T>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || v === defaults[k]) next.delete(k);
      else next.set(k, String(v));
    }
    if (resetPage && !("page" in patch)) next.delete("page");
    const s = next.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, path, router]);
  return [state, set] as const;
}

/** Text input that debounces into URL state. */
export function SearchBox({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setLocal(value); } // external change (e.g. Clear filters) → resync
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);
  return <Input type="search" aria-label={placeholder} value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} className="w-64 max-w-full" />;
}

/* ───────────── data table ───────────── */
export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
  align?: "right";
}
export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, onRowClick, sort, onSort, pageSize = 10 }: {
  columns: Column<T>[]; rows: T[] | undefined; rowKey: (r: T) => string; loading?: boolean; error?: unknown; onRetry?: () => void;
  empty?: ReactNode; onRowClick?: (r: T) => void; sort?: string; onSort?: (key: string) => void; pageSize?: number;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx("px-4 py-2.5", c.align === "right" && "text-right", c.className)} aria-sort={sort === c.key ? "descending" : undefined}>
                {c.sortable && onSort ? <button onClick={() => onSort(c.key)} className={cx("uppercase hover:text-slate-900", sort === c.key && "text-indigo-700")}>{c.header}{sort === c.key ? " ↓" : ""}</button> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading && !rows
            ? Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.key} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-32" /></td>)}</tr>
              ))
            : rows?.map((r) => (
                <tr
                  key={rowKey(r)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cx("transition-colors", onRowClick && "cursor-pointer hover:bg-indigo-50/40", loading && "opacity-60")}
                >
                  {columns.map((c) => <td key={c.key} className={cx("px-4 py-2.5 align-middle text-slate-800", c.align === "right" && "text-right tabular-nums", c.className)}>{c.cell(r)}</td>)}
                </tr>
              ))}
        </tbody>
      </table>
      {rows && rows.length === 0 && (empty ?? <EmptyState title="Nothing to show" hint="Try adjusting your filters." />)}
    </div>
  );
}

export function Pagination({ meta, onPage }: { meta?: PageMeta; onPage: (p: number) => void }) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">
      <span>{from}–{to} of {meta.total.toLocaleString("en-IN")}</span>
      <div className="flex items-center gap-1">
        <Btn size="sm" aria-label="Previous page" disabled={!meta.hasPreviousPage} onClick={() => onPage(meta.page - 1)}><ChevronLeft className="size-3.5" /></Btn>
        <span className="px-2">Page {meta.page} / {meta.totalPages}</span>
        <Btn size="sm" aria-label="Next page" disabled={!meta.hasNextPage} onClick={() => onPage(meta.page + 1)}><ChevronRight className="size-3.5" /></Btn>
      </div>
    </nav>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">{children}</div>;
}

/** Key/value list used on detail pages. */
export function DL({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="min-w-0 break-words text-slate-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
