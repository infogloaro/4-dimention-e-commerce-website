/**
 * Display formatting. Money arrives from the API as integer minor units (paise) and is converted to a display string only
 * here, at the UI boundary. Dates arrive as UTC ISO strings and are shown in the store timezone.
 */
export const STORE_TZ = "Asia/Kolkata";

export function money(minor: number | null | undefined, currency = "INR"): string {
  if (minor === null || minor === undefined || Number.isNaN(minor)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}

export function formatDate(iso: string | Date | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: STORE_TZ, day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(d);
}

/** "12 Oct – 16 Oct", or a single date when both ends fall on the same day. */
export function formatDateRange(min: string | null | undefined, max: string | null | undefined): string | null {
  if (!min && !max) return null;
  const short = (v: string) => new Intl.DateTimeFormat("en-IN", { timeZone: STORE_TZ, day: "numeric", month: "short" }).format(new Date(v));
  if (min && max && short(min) !== short(max)) return `${short(min)} – ${short(max)}`;
  return short((min ?? max)!);
}
