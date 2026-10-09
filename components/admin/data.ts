"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, type PageMeta, type Query } from "@/lib/admin/api";
import { downloadFile, toCsv } from "@/lib/admin/format";
import { useToast } from "./ui";

/** Paginated list query that keeps the previous page on screen while the next one loads. */
export function usePagedQuery<T>(key: string, path: string, params: Query, enabled = true, refetchMs?: number) {
  const q = useQuery({
    queryKey: ["admin", key, params],
    enabled,
    placeholderData: keepPreviousData,
    // optional live refresh (only while the tab is visible)
    refetchInterval: refetchMs ? () => (typeof document !== "undefined" && document.visibilityState === "visible" ? refetchMs : false) : false,
    queryFn: ({ signal }) => api.get<T[]>(path, params, signal),
  });
  return { rows: q.data?.data, meta: q.data?.meta as PageMeta | undefined, isLoading: q.isLoading, isFetching: q.isFetching, error: q.error, refetch: q.refetch };
}

export function useDataQuery<T>(key: QueryKey, path: string, params?: Query, enabled = true) {
  return useQuery({ queryKey: ["admin", ...key, params ?? null], enabled, queryFn: async ({ signal }) => (await api.get<T, unknown>(path, params, signal)).data });
}

/** Mutation that toasts on success/failure and refreshes every admin query by default. */
export function useAdminMutation<TArg = void, TRes = unknown>(fn: (arg: TArg) => Promise<TRes>, opts?: { success?: string | ((r: TRes) => string); invalidate?: string[]; onSuccess?: (r: TRes) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts?.success) toast.success(typeof opts.success === "function" ? opts.success(r) : opts.success);
      if (opts?.invalidate) opts.invalidate.forEach((k) => qc.invalidateQueries({ queryKey: ["admin", k] }));
      else qc.invalidateQueries({ queryKey: ["admin"] });
      opts?.onSuccess?.(r);
    },
    onError: (e) => toast.fail(e),
  });
}

/**
 * CSV export built from the same permissioned list endpoint the table uses (so the server decides what the
 * caller may see). Capped at 5,000 rows; only the columns listed are exported (data minimisation).
 */
export async function exportCsv<T extends object>(path: string, params: Query, columns: { key: string; label: string; get?: (r: T) => unknown }[], filename: string, maxRows = 5000): Promise<number> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; rows.length < maxRows; page++) {
    const res = await api.get<T[]>(path, { ...params, page, pageSize: 100 });
    for (const r of res.data) rows.push(Object.fromEntries(columns.map((c) => [c.key, c.get ? c.get(r) : (r as Record<string, unknown>)[c.key]])));
    if (!res.meta?.hasNextPage) break;
  }
  const out = rows.slice(0, maxRows);
  downloadFile(filename, toCsv(out, columns));
  return out.length;
}
