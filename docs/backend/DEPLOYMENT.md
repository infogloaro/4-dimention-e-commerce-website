# Development setup, environment & deployment

## Local setup
```bash
cd 4d-commerce
npm install                    # postinstall runs `prisma generate`
cp .env.example .env           # dev defaults work as-is
npm run db:up                  # PostgreSQL 17 container on :5440 (needs Docker) — or use your own and edit DATABASE_URL
npm run db:migrate
npm run db:seed                # demo data (dev only)
npm run dev                    # http://localhost:3000 — API at /api/v1
```
Dev logins (**development only**, from `SEED_*`): `admin@4dcommerce.dev` / `Admin@12345`, `superadmin@4dcommerce.dev` (same password), staff for every role (`manager@`, `products@`, `orders@`, `inventory@`, `support@4dcommerce.dev`), customer `aarav@example.com` / `Customer@12345` (also `meera@`, `rohan@`, `zoya@`, `neha@example.com`). Seed refuses to create them when `NODE_ENV=production`.

Reset dev data: truncate (see `tests/support/truncate.sql`) then `npm run db:seed`; `prisma migrate reset` is blocked for non-interactive agents.

## Scripts
| | |
|---|---|
| `npm run typecheck` / `lint` / `build` | static checks / production build |
| `npm test` · `test:unit` · `test:integration` | Vitest. Integration tests run the **real route handlers against a real PostgreSQL test database** (`fourd_commerce_test`, created by `TEST_DATABASE_URL`; the runner refuses any DB whose name lacks "test", applies migrations automatically and truncates between suites) |
| `npm run docs:api` | regenerate `API.md`, `ERROR_CODES.md`, `openapi.json` |
| `npm run db:generate · db:migrate · db:migrate:dev · db:seed` | Prisma helpers |

## Environment variables (`.env.example`)
| Variable | Purpose |
|---|---|
| `NODE_ENV`, `APP_URL`, `API_URL`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY` | origins (CSRF/CORS allow-list is `APP_URL` + extras); trust `X-Forwarded-For` behind a proxy/ALB |
| `DATABASE_URL`, `TEST_DATABASE_URL`, `DB_POOL_MAX` (20) | PostgreSQL |
| `AUTH_SECRET` (≥32 chars; **required, non-placeholder in production**) | HMAC pepper for all token hashes |
| `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS`, `CART_COOKIE_NAME` | cookies |
| `STORE_CURRENCY`, `STORE_PRICES_INCLUDE_TAX`, `STORE_DEFAULT_COUNTRY`, `STOCK_RESERVATION_MINUTES` | commerce defaults |
| `PAYMENT_PROVIDER` (`mock\|razorpay\|stripe`; `mock` forbidden in prod), `PAYMENT_WEBHOOK_SECRET` (mock), `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`, `STRIPE_SECRET_KEY/WEBHOOK_SECRET` | payments |
| `STORAGE_PROVIDER` (`local\|s3\|cloudinary`), `STORAGE_BUCKET/REGION/ENDPOINT/ACCESS_KEY/SECRET_KEY/PUBLIC_URL`, `CLOUDINARY_URL` | media |
| `EMAIL_PROVIDER/FROM/API_KEY`, `SMS_PROVIDER/API_KEY`, `WHATSAPP_PROVIDER/API_KEY` | notifications (`console` = log only) |
| `JOBS_TOKEN` (≥24 chars) | enables `POST /api/v1/jobs/maintenance` |
| `RATE_LIMIT_ENABLED`, `LOG_LEVEL` | ops |
| `SEED_ADMIN_EMAIL/PASSWORD`, `SEED_CUSTOMER_PASSWORD` | dev seed only |

## Production / AWS checklist
1. **Database**: RDS/Aurora PostgreSQL ≥15 (`pg_trgm` is available on RDS). Run `npx prisma migrate deploy` in the release pipeline (never `migrate dev`).
2. **App**: build once (`npm run build`), run `npm start` behind an ALB (ECS Fargate / App Runner / Amplify Hosting). Set `TRUST_PROXY=true` only if the proxy overwrites `X-Forwarded-For`. Terminate TLS at the ALB (cookies are `Secure` in production). `next start` gzip-compresses responses.
3. **Secrets** in Secrets Manager/SSM → env: `AUTH_SECRET`, `DATABASE_URL`, provider keys. Use a real `PAYMENT_PROVIDER`.
4. **Webhooks**: point Razorpay/Stripe to `https://<host>/api/v1/payments/webhooks/{razorpay|stripe}` and set the matching secret.
5. **Scheduler**: EventBridge rule every 5 min → `POST /api/v1/jobs/maintenance` with `Authorization: Bearer $JOBS_TOKEN` (expires unpaid reservations, refreshes analytics, purges old sessions/tokens/keys).
6. **Scale-out**: replace `MemoryRateLimiter` (`setRateLimiter`) and `memo()` with Redis/ElastiCache-backed implementations; tune `DB_POOL_MAX` × instances ≤ DB `max_connections` (use RDS Proxy for many instances).
7. **Media**: `STORAGE_PROVIDER=s3` (+ CloudFront as `STORAGE_PUBLIC_URL`) — the browser uploads straight to S3 with the presigned PUT from `/admin/media/sign`.
8. **Observability**: stdout JSON logs → CloudWatch; alarm on `/api/v1/health` (503 = DB down) and on `level:"error"`; correlate with `X-Request-Id`.
9. **Notifications**: register an SES/Twilio/WhatsApp provider with `registerProvider()` and set `EMAIL_PROVIDER` etc.
10. Never run the seed with demo accounts in production (it won't — `NODE_ENV=production` skips them — but only run the base seed).
