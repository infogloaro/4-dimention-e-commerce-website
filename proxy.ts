import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge of the API: CORS for explicitly allowed origins + preflight handling + request id propagation.
 * Business auth/RBAC/CSRF live in the route wrapper (server/core/http.ts), not here.
 */
const allowed = () =>
  [process.env.APP_URL ?? "http://localhost:3000", ...(process.env.CORS_ALLOWED_ORIGINS ?? "").split(",")]
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

export function proxy(req: NextRequest) {
  const origin = req.headers.get("origin");
  const isAllowed = !!origin && allowed().includes(origin.replace(/\/$/, ""));

  const cors: Record<string, string> = isAllowed
    ? {
        "Access-Control-Allow-Origin": origin!,
        "Access-Control-Allow-Credentials": "true",
        Vary: "Origin",
        "Access-Control-Expose-Headers": "X-Request-Id, Idempotent-Replay, Retry-After",
      }
    : {};

  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: isAllowed ? 204 : 403,
      headers: { ...cors, "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key, X-Request-Id, X-Auth-Mode", "Access-Control-Max-Age": "600" },
    });
  }

  const headers = new Headers(req.headers);
  if (!headers.get("x-request-id")) headers.set("x-request-id", crypto.randomUUID());
  const res = NextResponse.next({ request: { headers } });
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: "/api/:path*" };
