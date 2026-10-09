/**
 * Typed client for the 4D Commerce JSON API (see docs/backend/FRONTEND_INTEGRATION.md).
 * Auth is an HttpOnly cookie, so requests are same-origin with credentials; the server enforces every permission.
 */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiResult<T, M = PageMeta> {
  data: T;
  meta?: M;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { fields?: { path: string; message: string }[]; [k: string]: unknown },
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Query = Record<string, string | number | boolean | undefined | null | (string | number)[]>;

export function qs(query?: Query): string {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)));
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const UNAUTH_EVENT = "admin:unauthenticated";

interface Opts {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Query;
  body?: unknown;
  form?: FormData;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function apiRequest<T, M = PageMeta>(path: string, opts: Opts = {}): Promise<ApiResult<T, M>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}${qs(opts.query)}`, { method: opts.method ?? "GET", headers, body, credentials: "include", signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK_ERROR", "Network error — check your connection and retry.");
  }
  if (res.status === 204) return { data: undefined as T };
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.success === false) {
    const err = json?.error;
    if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTH_EVENT));
    throw new ApiError(res.status, err?.code ?? "UNKNOWN", err?.message ?? `Request failed (${res.status})`, err?.details, json?.requestId ?? res.headers.get("x-request-id") ?? undefined);
  }
  return { data: json.data as T, meta: json.meta };
}

export const api = {
  get: <T, M = PageMeta>(path: string, query?: Query, signal?: AbortSignal) => apiRequest<T, M>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, extra?: Pick<Opts, "idempotencyKey">) => apiRequest<T>(path, { method: "POST", body: body ?? {}, ...extra }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  del: <T = void>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => apiRequest<T>(path, { method: "POST", form }),
};

export const newIdempotencyKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Human-readable message including field-level validation errors. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const f = e.details?.fields?.map((x) => `${x.path}: ${x.message}`).join("; ");
    return f ? `${e.message} (${f})` : e.message;
  }
  return e instanceof Error ? e.message : "Something went wrong";
}
