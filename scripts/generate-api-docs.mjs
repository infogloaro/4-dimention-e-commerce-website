/**
 * Generates docs/backend/API.md and docs/backend/openapi.json from the actual route handlers, so the documented
 * inventory (paths, methods, auth, permissions) can never drift from the code.   npm run docs:api
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "app/api/v1");
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : f === "route.ts" && files.push(path.join(d, f))));
walk(root);

const endpoints = [];
for (const file of files) {
  const rel = path.relative(root, path.dirname(file)).split(path.sep).join("/");
  const urlPath = "/api/v1" + (rel ? "/" + rel : "");
  const src = readFileSync(file, "utf8");
  const re = /(?:\/\*\*([\s\S]*?)\*\/\s*)?export const (GET|POST|PUT|PATCH|DELETE) = route\(\s*(\{[^]*?\})\s*,\s*(?:async\s*)?\(/g;
  let m;
  let found = false;
  while ((m = re.exec(src))) {
    found = true;
    const [, doc, method, opts] = m;
    const perm = /permission:\s*(\[[^\]]*\]|"[^"]*")/.exec(opts)?.[1]?.replace(/["\[\]\s]/g, "").split(",").filter(Boolean) ?? [];
    const any = /permissionMode:\s*"any"/.test(opts);
    const auth = perm.length ? "permission" : /auth:\s*"required"/.test(opts) ? "required" : /auth:\s*"optional"/.test(opts) ? "optional" : "public";
    endpoints.push({
      method, path: urlPath.replace(/\[([^\]]+)\]/g, ":$1"), oaPath: urlPath.replace(/\[([^\]]+)\]/g, "{$1}"), auth, perm, any,
      hasBody: /body:/.test(opts), hasQuery: /query:/.test(opts),
      idem: /idempotency/i.test(src) && method === "POST" && /Idempotency-Key/.test(src),
      doc: (doc ?? "").replace(/^\s*\*\s?/gm, "").replace(/\s+/g, " ").trim(),
    });
  }
  if (!found) {
    const plain = /export async function (GET|POST)\b/.exec(src);
    if (plain) endpoints.push({ method: plain[1], path: urlPath, oaPath: urlPath, auth: "public", perm: [], any: false, hasBody: false, hasQuery: false, idem: false, doc: "Liveness + DB readiness probe." });
  }
}

const order = ["auth", "users", "products", "categories", "brands", "collections", "search", "recommendations", "recently-viewed", "cart", "wishlist", "addresses", "shipping", "checkout", "payments", "orders", "tracking", "returns", "reviews", "coupons", "notifications", "support", "home", "content", "settings", "admin", "jobs", "health"];
const group = (e) => e.path.split("/")[3] ?? "";
const methodOrder = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
endpoints.sort((a, b) => order.indexOf(group(a)) - order.indexOf(group(b)) || a.path.localeCompare(b.path) || methodOrder[a.method] - methodOrder[b.method]);

const authLabel = (e) => (e.auth === "permission" ? `\`${e.perm.join(e.any ? "` or `" : "` + `")}\`` : e.auth === "required" ? "Signed-in user" : e.auth === "optional" ? "Optional session / guest cart" : "Public");

let md = `# API inventory\n\n> Generated from the route handlers by \`npm run docs:api\` — **do not edit by hand.** ${endpoints.length} operations.\n\nBase URL: \`/api/v1\`. All responses use the envelope in [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md). Machine-readable spec: [openapi.json](openapi.json).\n\n**Auth column:** *Public* = no session needed · *Optional* = works for guests, richer when signed in · *Signed-in user* = any authenticated customer or staff · backticked values = RBAC permission(s) required (enforced server-side).\n`;
let cur = "";
for (const e of endpoints) {
  const g = group(e);
  if (g !== cur) {
    cur = g;
    md += `\n## ${g.toUpperCase()}\n\n| Method | Path | Auth / permission | Notes |\n|---|---|---|---|\n`;
  }
  const notes = [e.idem ? "**Idempotency-Key required**" : "", e.doc].filter(Boolean).join(" — ").replace(/\|/g, "\\|");
  md += `| ${e.method} | \`${e.path}\` | ${authLabel(e)} | ${notes} |\n`;
}
md += `\n## Error codes\n\nSee [ERROR_CODES.md](ERROR_CODES.md).\n`;
writeFileSync("docs/backend/API.md", md);

const paths = {};
for (const e of endpoints) {
  const params = [...e.oaPath.matchAll(/\{(\w+)\}/g)].map((p) => ({ name: p[1], in: "path", required: true, schema: { type: "string" } }));
  (paths[e.oaPath] ??= {})[e.method.toLowerCase()] = {
    tags: [group(e)],
    summary: e.doc || `${e.method} ${e.path}`,
    parameters: [...params, ...(e.idem ? [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } }] : [])],
    ...(e.hasBody ? { requestBody: { content: { "application/json": { schema: { type: "object" } } } } } : {}),
    security: e.auth === "public" ? [] : e.auth === "optional" ? [{}, { cookieAuth: [] }, { bearerAuth: [] }] : [{ cookieAuth: [] }, { bearerAuth: [] }],
    ...(e.perm.length ? { "x-required-permissions": e.perm, "x-permission-mode": e.any ? "any" : "all" } : {}),
    responses: {
      200: { description: "Success envelope { success: true, data, meta? }" },
      ...(e.auth !== "public" ? { 401: { description: "UNAUTHENTICATED" } } : {}),
      ...(e.perm.length ? { 403: { description: "FORBIDDEN" } } : {}),
      422: { description: "VALIDATION_ERROR" },
    },
  };
}
writeFileSync(
  "docs/backend/openapi.json",
  JSON.stringify({ openapi: "3.1.0", info: { title: "4D Commerce API", version: "1.0.0", description: "Generated from route handlers. Request/response schemas live in server/validation (Zod); see docs/backend/FRONTEND_INTEGRATION.md for the envelope." }, servers: [{ url: "/" }], components: { securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "fourd_session" }, bearerAuth: { type: "http", scheme: "bearer" } } }, paths }, null, 2),
);
console.log(`wrote docs/backend/API.md and openapi.json (${endpoints.length} operations)`);

// ── error codes (from server/core/errors.ts) ──
const errSrc = readFileSync("server/core/errors.ts", "utf8");
const block = /ERROR_STATUS = \{([\s\S]*?)\} as const/.exec(errSrc)[1];
let ec = `# Error codes\n\n> Generated from \`server/core/errors.ts\` by \`npm run docs:api\`.\n\nEvery failure returns \`{ "success": false, "error": { "code", "message", "details" }, "requestId" }\`. Switch on \`error.code\`, never on \`message\`. \`details\` is code-specific (e.g. \`VALIDATION_ERROR\` → \`{ fields: [{ path, code, message }] }\`, \`INSUFFICIENT_STOCK\` → \`{ variantId, available, requested }\`).\n\n| Code | HTTP |\n|---|---|\n`;
for (const line of block.split("\n")) {
  const mm = /^\s*([A-Z_]+):\s*(\d+),/.exec(line);
  if (mm) ec += `| \`${mm[1]}\` | ${mm[2]} |\n`;
  else if (/^\s*\/\/\s*(\w[\w /]*)$/.test(line)) ec += `| **${/\/\/\s*(.*)$/.exec(line)[1]}** | |\n`;
}
writeFileSync("docs/backend/ERROR_CODES.md", ec);
