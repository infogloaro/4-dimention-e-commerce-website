/**
 * Storefront API client. Same typed, envelope-aware, cookie-credentialed client the admin console uses — the backend is
 * one API with one error format, so there is deliberately one client (docs/backend/FRONTEND_INTEGRATION.md §1-4).
 */
export { api, apiRequest, ApiError, errorMessage, newIdempotencyKey, qs, type PageMeta, type ApiResult, type Query } from "@/lib/admin/api";
