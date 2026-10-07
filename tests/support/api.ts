import { NextRequest } from "next/server";
import type { RouteContext } from "@/server/core/http";

type Handler = (req: NextRequest, ctx?: RouteContext) => Promise<Response>;

export interface ApiResult<T = any> {
  status: number;
  body: { success: boolean; data: T; meta?: any; error?: { code: string; message: string; details: any }; requestId?: string };
  headers: Headers;
  cookies: Record<string, string>;
}

export interface CallOptions {
  method?: string;
  path?: string;
  query?: Record<string, string | number | boolean | string[]>;
  body?: unknown;
  raw?: string;
  headers?: Record<string, string>;
  /** Bearer session token */
  token?: string;
  /** Cookie header value, e.g. "fourd_cart=abc" */
  cookie?: string;
  params?: Record<string, string | string[]>;
  /** Set false to omit the Origin header (simulates a non-browser client). */
  origin?: string | false;
}

/** Invoke a real Next.js route handler exactly as the framework would — validation, auth, RBAC, rate limiting and all. */
export async function call<T = any>(handler: Handler, o: CallOptions = {}): Promise<ApiResult<T>> {
  const url = new URL(o.path ?? "/api/v1/test", "http://localhost:3000");
  for (const [k, v] of Object.entries(o.query ?? {})) for (const x of Array.isArray(v) ? v : [v]) url.searchParams.append(k, String(x));
  const headers = new Headers({ "x-forwarded-for": "203.0.113.7", ...(o.headers ?? {}) });
  if (o.origin !== false) headers.set("origin", o.origin ?? "http://localhost:3000");
  if (o.token) headers.set("authorization", `Bearer ${o.token}`);
  if (o.cookie) headers.set("cookie", o.cookie);
  let body: string | undefined;
  if (o.raw !== undefined) body = o.raw;
  else if (o.body !== undefined) {
    body = JSON.stringify(o.body);
    headers.set("content-type", "application/json");
  }
  const req = new NextRequest(url, { method: o.method ?? "GET", headers, body });
  const res = await handler(req, { params: Promise.resolve(o.params ?? {}) });
  const text = await res.text();
  const cookies: Record<string, string> = {};
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const [name, ...rest] = pair!.split("=");
    cookies[name!] = rest.join("=");
  }
  return { status: res.status, body: text ? JSON.parse(text) : (undefined as never), headers: res.headers, cookies };
}
