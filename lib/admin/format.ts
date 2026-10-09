/**
 * Formatting policy: money is integer minor units (paise). Dates are stored/served as UTC ISO strings and
 * displayed in the store timezone (IST). Analytics rollups are UTC days (docs/backend/ADMIN.md).
 */
export const STORE_TZ = "Asia/Kolkata";

export function fmtMoney(minor: number | null | undefined, currency = "INR"): string {
  if (minor === null || minor === undefined || Number.isNaN(minor)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}

export function fmtCompactMoney(minor: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(minor / 100);
}

export const fmtNumber = (n: number | null | undefined) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("en-IN").format(n));

export function fmtDate(iso: string | Date | null | undefined, withTime = true): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: STORE_TZ, day: "2-digit", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(d);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso, false);
}

/** Rupees typed by a human → paise. Returns null when not a valid non-negative amount. */
export function rupeesToMinor(v: string): number | null {
  const n = Number(v.replace(/,/g, "").trim());
  if (v.trim() === "" || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
export const minorToRupees = (m: number | null | undefined) => (m === null || m === undefined ? "" : String(m / 100));

export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** ISO date (YYYY-MM-DD) for a date offset from today, in the store timezone. */
export function isoDay(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: STORE_TZ }).format(d);
}

/** CSV with spreadsheet-formula injection protection. */
export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => cell(c.label)).join(","), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(","))].join("\n");
}

export function downloadFile(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(["﻿" + content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";
const STATUS_TONE: Record<string, Tone> = {
  PENDING_PAYMENT: "warning", PLACED: "info", CONFIRMED: "info", PROCESSING: "accent", PACKED: "accent", SHIPPED: "accent",
  OUT_FOR_DELIVERY: "accent", DELIVERED: "success", CANCELLED: "danger", FAILED: "danger", RETURN_REQUESTED: "warning", RETURNED: "neutral",
  UNPAID: "warning", PENDING: "warning", PAID: "success", PARTIALLY_REFUNDED: "warning", REFUNDED: "neutral",
  ACTIVE: "success", DRAFT: "neutral", ARCHIVED: "neutral", SUSPENDED: "warning", BANNED: "danger", PENDING_VERIFICATION: "warning", DELETED: "danger",
  REQUESTED: "warning", APPROVED: "info", REJECTED: "danger", PICKUP_SCHEDULED: "info", PICKED_UP: "accent", RECEIVED: "accent", REFUND_PENDING: "warning", COMPLETED: "success",
  OPEN: "warning", PENDING_CUSTOMER: "info", IN_PROGRESS: "accent", RESOLVED: "success", CLOSED: "neutral",
  CREATED: "neutral", AUTHORIZED: "info", CAPTURED: "success", PROCESSED: "success", INITIATED: "warning",
  LABEL_CREATED: "info", IN_TRANSIT: "accent", REACHED_HUB: "accent", FAILED_DELIVERY: "danger", RETURNED_TO_SENDER: "danger",
};
export const toneFor = (status: string): Tone => STATUS_TONE[status] ?? "neutral";
