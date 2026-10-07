# 4D Commerce

Premium multi-category e-commerce marketplace — Next.js 16 frontend (in progress) + production-grade backend (this repo).

* **Backend docs:** [`docs/backend/`](docs/backend/README.md) — start with `IMPLEMENTATION_STATUS.md` and `DEPLOYMENT.md`.
* **Product spec:** `docs/4D_Commerce_Advanced_Ecommerce_Frontend_Specification.docx`.

## Quick start
```bash
npm install
cp .env.example .env
npm run db:up && npm run db:migrate && npm run db:seed
npm run dev            # http://localhost:3000   (API: /api/v1, health: /api/v1/health)
npm test               # unit + integration tests (real PostgreSQL test DB)
```
Stack: Next.js 16 · TypeScript · PostgreSQL 17 · Prisma 7 · Zod · Vitest. API reference: `docs/backend/API.md` (generated: `npm run docs:api`).
