# Security

| Concern | Implementation |
|---|---|
| Authentication | opaque hashed sessions, scrypt passwords, lockout, rotation — [AUTH.md](AUTH.md) |
| Authorization | server-side RBAC per route + ownership checks; cross-user access → 404 — [RBAC.md](RBAC.md) |
| Input validation | Zod on every body/query/param **before** business logic; unknown body keys stripped (strict on updates → `422`); size limits (1 MB default, 2 MB product writes, 512 KB webhooks, 25 MB uploads via Content-Length); JSON-only (`415`) |
| Injection | Prisma parameterisation; raw SQL uses tagged templates (parameters, never string concatenation); `LIKE` input escaped; search tested with `%`, `_`, `'; DROP TABLE …`, `\` |
| XSS | JSON API (never HTML). User-generated text (reviews, questions, tickets, names, addresses) has markup stripped on write and control characters removed; clients must still render it as text. CMS CTA URLs must be site paths or http(s) (`javascript:` rejected). Emails escape HTML. |
| CSRF | SameSite=Lax + Origin/Referer allow-list on unsafe methods |
| CORS | `proxy.ts` allows only `APP_URL` + `CORS_ALLOWED_ORIGINS` (credentials allowed for those only); preflight from others → 403 |
| Headers | `nosniff`, `X-Frame-Options: DENY`, HSTS (2 y, preload), `Referrer-Policy`, `Permissions-Policy`, COOP, `X-Powered-By` removed; API responses add `CSP: default-src 'none'` and `X-Robots-Tag: noindex`; private responses `Cache-Control: private, no-store` |
| Rate limiting | per user (or IP) with named buckets: reads 300/min, writes 90/min, search 120/min, auth 10/15 min, sensitive 5/15 min, checkout 20/min, webhooks 600/min, admin 600/min → `429` + `Retry-After`. **In-memory** (single instance); implement `RateLimiter` over Redis before scaling out. |
| Abuse limits | page size ≤ 100, offset depth ≤ 10 000, facet id cap, ≤ 50 cart lines, ≤ 6 search tokens, ≤ 20 addresses, review/question length caps |
| Payments | secrets only from env; webhooks signature-verified on raw body, idempotent, amount-checked; client never asserts success; no card data ever touches this service |
| Secrets | `.env` git-ignored, `.env.example` has placeholders only; production refuses `AUTH_SECRET` placeholders and the mock payment provider; logger redacts credential-like keys; tokens hashed at rest; reset/OTP tokens redacted from the outbox |
| Trust boundaries | prices, totals, discounts, stock, order status, payment status, permissions and "verified purchase" are always computed server-side (tests send forged `price`, `isVerifiedPurchase`, `role` fields and a stale `expectedTotal`) |
| Uploads | content sniffed (magic bytes) vs declared type; allow-list of image/video types; random server-generated keys; path characters stripped |
| Errors | stable codes; 5xx never leaks internals/stack (logged server-side with `requestId`) |
| Data | DB CHECK constraints for money/stock invariants; soft delete for products/addresses; orders snapshot data |
| Audit | admin and security-relevant actions with actor/IP/request id |

## Known limitations / follow-ups
* Rate limiter and cache are per-process (see above).
* No CAPTCHA/bot scoring on register/login (rate limit + lockout only).
* Email/SMS/WhatsApp providers: the abstraction, outbox and templates are complete; **no real provider adapter is shipped** (console provider only). Register one with `registerProvider()`.
* Session cookies are `Secure` only when `NODE_ENV=production` (so local HTTP dev works).
* `npm audit` reports 12 high findings, all in **dev-time tooling** (Prisma CLI's `mysql2`, `eslint-config-next`/`shadcn` via `fast-glob`/`micromatch`/`braces`, `deepmerge-ts`). None is in the runtime request path; the suggested `--force` fix would downgrade Prisma to v6 (breaking). Re-check after Prisma/Next/shadcn releases.
