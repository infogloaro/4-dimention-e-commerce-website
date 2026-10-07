import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType, type z } from "zod";
import { runWithContext, getContext } from "./context";
import { env } from "./env";
import { AppError } from "./errors";
import { logger } from "./logger";
import { enforceRateLimit, RL, type RateLimitPolicy } from "./rate-limit";
import type { Paginated } from "./pagination";
import { authenticateToken, assertPermissions, type AuthUser } from "../auth/session";
import type { Permission } from "../auth/permissions";

// ───────────────────────────── response helpers ─────────────────────────────

export interface Reply<T = unknown> {
  __reply: true;
  status: number;
  data?: T;
  meta?: object;
  headers?: Record<string, string>;
}

export const reply = <T>(data: T, init: { status?: number; meta?: object; headers?: Record<string, string> } = {}): Reply<T> => ({
  __reply: true,
  status: init.status ?? 200,
  data,
  meta: init.meta,
  headers: init.headers,
});
export const created = <T>(data: T, meta?: Record<string, unknown>) => reply(data, { status: 201, meta });
export const accepted = <T>(data: T) => reply(data, { status: 202 });
export const noContent = (): Reply<undefined> => ({ __reply: true, status: 204 });
/** Cache hint for public, user-independent GET responses (CDN friendly). */
export const publicCache = (sMaxAge = 60, swr = 300) => ({
  "Cache-Control": `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
});

const isReply = (v: unknown): v is Reply => typeof v === "object" && v !== null && (v as Reply).__reply === true;
const isPaginated = (v: unknown): v is Paginated<unknown> =>
  typeof v === "object" && v !== null && Array.isArray((v as Paginated<unknown>).items) && "meta" in (v as object) && "page" in ((v as Paginated<unknown>).meta ?? {});

// ───────────────────────────── cookies ─────────────────────────────

interface CookieOpts {
  maxAgeSec?: number;
  httpOnly?: boolean;
  path?: string;
}

class CookieJar {
  readonly pending: Array<{ name: string; value: string; opts: CookieOpts }> = [];
  set(name: string, value: string, opts: CookieOpts = {}) {
    this.pending.push({ name, value, opts });
  }
  delete(name: string) {
    this.pending.push({ name, value: "", opts: { maxAgeSec: 0 } });
  }
}

// ───────────────────────────── route builder ─────────────────────────────

export interface RouteOptions<Q extends ZodType | undefined, B extends ZodType | undefined, P extends ZodType | undefined> {
  /** "none" (default) = public; "optional" = user attached if present; "required" = 401 without a session. */
  auth?: "none" | "optional" | "required";
  /** Requires authentication AND every listed permission. */
  permission?: Permission | Permission[];
  /** `any` lets one permission from the list suffice. */
  permissionMode?: "all" | "any";
  query?: Q;
  body?: B;
  params?: P;
  rateLimit?: RateLimitPolicy | false;
  /** Disable CSRF origin checking (webhooks only). */
  csrf?: boolean;
  /** Max request body in bytes. Default 1 MiB. */
  maxBodyBytes?: number;
  /** Skip JSON parsing; handler receives `rawBody` (webhook signature verification). */
  raw?: boolean;
  /** multipart/form-data upload: body is NOT pre-read; handler calls `ctx.req.formData()`. Size-checked via Content-Length. */
  multipart?: boolean;
}

type Infer<S> = S extends ZodType ? z.output<S> : undefined;

export interface HandlerCtx<Q, B, P> {
  req: NextRequest;
  query: Q;
  body: B;
  params: P;
  /** Authenticated user (always set when auth is "required" or permission is given). */
  user: AuthUser | null;
  requestId: string;
  ip: string;
  userAgent: string | null;
  /** Raw (unhashed) guest cart token from cookie, if any. */
  guestToken: string | null;
  rawBody: string;
  cookies: CookieJar;
  /** Convenience for handlers that declared auth: "required" / permission. */
  requireUser(): AuthUser;
}

export type RouteContext = { params: Promise<Record<string, string | string[]>> };

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function clientIp(req: NextRequest): string {
  if (env.TRUST_PROXY) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim();
  }
  return "unknown";
}

function checkOrigin(req: NextRequest, usesCookieAuth: boolean) {
  const origin = req.headers.get("origin");
  if (origin) {
    if (!env.corsOrigins.includes(origin.replace(/\/$/, ""))) {
      throw new AppError("CSRF_REJECTED", "Cross-origin request rejected");
    }
    return;
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      if (!env.corsOrigins.includes(new URL(referer).origin)) throw new AppError("CSRF_REJECTED", "Cross-origin request rejected");
    } catch (e) {
      if (e instanceof AppError) throw e;
    }
    return;
  }
  // No Origin/Referer: non-browser client. Browsers flag cross-site fetches explicitly.
  if (usesCookieAuth && req.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError("CSRF_REJECTED", "Cross-site request rejected");
  }
}

async function readBody(req: NextRequest, limit: number): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > limit) throw new AppError("PAYLOAD_TOO_LARGE", "Request body too large");
  const text = await req.text();
  if (Buffer.byteLength(text) > limit) throw new AppError("PAYLOAD_TOO_LARGE", "Request body too large");
  return text;
}

function zodDetails(e: ZodError) {
  return {
    fields: e.issues.map((i) => ({ path: i.path.join("."), code: i.code, message: i.message })),
  };
}

interface PrismaLikeError {
  code?: string;
  meta?: { target?: unknown; modelName?: string };
}

function normalizeError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof ZodError) return new AppError("VALIDATION_ERROR", "Request validation failed", zodDetails(e));
  const p = e as PrismaLikeError;
  if (p && typeof p.code === "string" && /^P\d{4}$/.test(p.code)) {
    if (p.code === "P2002") return new AppError("CONFLICT", "A record with these values already exists", { target: p.meta?.target });
    if (p.code === "P2025") return new AppError("NOT_FOUND", "Record not found");
    if (p.code === "P2034") return new AppError("CONFLICT", "The request conflicted with another update — please retry");
    if (p.code === "P2003") return new AppError("CONFLICT", "The record is referenced by other data");
    if (p.code === "P2004" || p.code === "P2010") {
      // DB CHECK constraint (e.g. stock) — surface as a conflict rather than a 500
      return new AppError("CONFLICT", "The operation violates a data constraint");
    }
  }
  return new AppError("INTERNAL_ERROR", "Something went wrong on our side. Please try again.");
}

function errorResponse(e: AppError, requestId: string): NextResponse {
  const res = NextResponse.json(
    { success: false, error: { code: e.code, message: e.message, details: e.details ?? {} }, requestId },
    { status: e.status, headers: e.headers },
  );
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Request-Id", requestId);
  return res;
}

function applyCookies(res: NextResponse, jar: CookieJar) {
  for (const c of jar.pending) {
    res.cookies.set(c.name, c.value, {
      httpOnly: c.opts.httpOnly ?? true,
      secure: env.isProd,
      sameSite: "lax",
      path: c.opts.path ?? "/",
      maxAge: c.opts.maxAgeSec,
    });
  }
}

export function route<
  Q extends ZodType | undefined = undefined,
  B extends ZodType | undefined = undefined,
  P extends ZodType | undefined = undefined,
>(opts: RouteOptions<Q, B, P>, handler: (ctx: HandlerCtx<Infer<Q>, Infer<B>, Infer<P>>) => Promise<unknown> | unknown) {
  return async (req: NextRequest, routeCtx?: RouteContext): Promise<NextResponse> => {
    const requestId = req.headers.get("x-request-id")?.slice(0, 64) || randomUUID();
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent");
    const started = Date.now();
    const path = req.nextUrl.pathname;

    return runWithContext({ requestId, ip, userAgent, method: req.method, path }, async () => {
      const jar = new CookieJar();
      try {
        const wantsAuth = opts.auth === "required" || opts.auth === "optional" || !!opts.permission;

        // 1) auth (cheap, needed for rate-limit identity and CSRF decision)
        const authHeader = req.headers.get("authorization");
        const bearer = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
        const cookieToken = req.cookies.get(env.SESSION_COOKIE_NAME)?.value ?? null;
        let user: AuthUser | null = null;
        if (wantsAuth || bearer || cookieToken) {
          user = await authenticateToken(bearer ?? cookieToken);
        }
        const usesCookieAuth = !bearer && !!cookieToken;
        const ctxStore = getContext();
        if (ctxStore && user) {
          ctxStore.actorId = user.id;
          ctxStore.actorRole = user.roleKey;
        }

        // 2) rate limit
        if (opts.rateLimit !== false) {
          const policy = opts.rateLimit ?? (SAFE.has(req.method) ? RL.read : RL.write);
          await enforceRateLimit(policy, user ? `u:${user.id}` : `ip:${ip}`);
        }

        // 3) CSRF — unsafe methods must come from an allowed origin
        if (!SAFE.has(req.method) && opts.csrf !== false) checkOrigin(req, usesCookieAuth || !!req.cookies.get(env.CART_COOKIE_NAME));

        // 4) authentication / authorization
        if ((opts.auth === "required" || opts.permission) && !user) {
          throw new AppError("UNAUTHENTICATED", "Authentication required");
        }
        if (opts.permission && user) {
          assertPermissions(user, Array.isArray(opts.permission) ? opts.permission : [opts.permission], opts.permissionMode);
        }

        // 5) validation
        let rawBody = "";
        let body: unknown = undefined;
        if (opts.multipart && !SAFE.has(req.method)) {
          const declared = Number(req.headers.get("content-length") ?? 0);
          if (!declared || declared > (opts.maxBodyBytes ?? 1_048_576)) throw new AppError("PAYLOAD_TOO_LARGE", "Upload too large or missing Content-Length");
          if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be multipart/form-data");
        }
        if (!SAFE.has(req.method) && (opts.body || opts.raw)) {
          rawBody = await readBody(req, opts.maxBodyBytes ?? 1_048_576);
          if (opts.body && !opts.raw) {
            const ct = req.headers.get("content-type") ?? "";
            if (rawBody.length && !ct.includes("application/json")) {
              throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
            }
            let json: unknown;
            try {
              json = rawBody.length ? JSON.parse(rawBody) : {};
            } catch {
              throw new AppError("BAD_REQUEST", "Malformed JSON body");
            }
            body = await opts.body.parseAsync(json);
          }
        }
        const query = opts.query
          ? await opts.query.parseAsync(Object.fromEntries(multiMap(req.nextUrl.searchParams)))
          : undefined;
        const params = opts.params ? await opts.params.parseAsync(routeCtx ? await routeCtx.params : {}) : undefined;

        const ctx: HandlerCtx<Infer<Q>, Infer<B>, Infer<P>> = {
          req,
          query: query as Infer<Q>,
          body: body as Infer<B>,
          params: params as Infer<P>,
          user,
          requestId,
          ip,
          userAgent,
          guestToken: req.cookies.get(env.CART_COOKIE_NAME)?.value ?? null,
          rawBody,
          cookies: jar,
          requireUser() {
            if (!user) throw new AppError("UNAUTHENTICATED", "Authentication required");
            return user;
          },
        };

        const out = await handler(ctx);

        // 6) respond
        let res: NextResponse;
        if (isReply(out)) {
          if (out.status === 204) res = new NextResponse(null, { status: 204 });
          else res = NextResponse.json({ success: true, data: out.data ?? null, ...(out.meta ? { meta: out.meta } : {}) }, { status: out.status });
          for (const [k, v] of Object.entries(out.headers ?? {})) res.headers.set(k, v);
        } else if (isPaginated(out)) {
          res = NextResponse.json({ success: true, data: out.items, meta: out.meta });
        } else {
          res = NextResponse.json({ success: true, data: out ?? null });
        }
        if (!res.headers.has("Cache-Control")) res.headers.set("Cache-Control", "private, no-store");
        res.headers.set("X-Request-Id", requestId);
        applyCookies(res, jar);
        logger.info("request", { method: req.method, path, status: res.status, ms: Date.now() - started });
        return res;
      } catch (e) {
        const appErr = normalizeError(e);
        if (appErr.status >= 500) {
          logger.error("unhandled error", { method: req.method, path, error: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : String(e) });
        } else {
          logger.info("request", { method: req.method, path, status: appErr.status, code: appErr.code, ms: Date.now() - started });
        }
        const res = errorResponse(appErr, requestId);
        applyCookies(res, jar);
        return res;
      }
    });
  };
}

/** `?a=1&a=2` → { a: ["1","2"] }, single values stay strings. */
function multiMap(sp: URLSearchParams): Map<string, string | string[]> {
  const out = new Map<string, string | string[]>();
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    out.set(key, all.length > 1 ? all : all[0]!);
  }
  return out;
}
