"use client";

import { useCallback, useEffect, useState } from "react";
import { api, qs, type ApiError, type PageMeta, type Query } from "./api";
import type { Brand, Category } from "./types";

export interface FetchState<T, M> {
  data: T | undefined;
  meta: M | undefined;
  error: ApiError | Error | null;
  loading: boolean;
  /** true while re-fetching with data from the previous request still shown */
  refreshing: boolean;
  reload: () => void;
}

/**
 * Small GET hook: aborts superseded requests, keeps the previous data visible while a new request is in flight (no
 * flashing skeletons on filter changes) and exposes `reload` for retry buttons. `path === null` disables the request.
 */
export function useApi<T, M = PageMeta>(path: string | null, query?: Query, opts: { pollMs?: number } = {}): FetchState<T, M> {
  // state is only ever written from async callbacks; "loading"/"refreshing" are derived by comparing request keys
  const [res, setRes] = useState<{ key: string | null; data?: T; meta?: M; error: ApiError | Error | null }>({ key: null, error: null });
  const [tick, setTick] = useState(0);
  const key = path === null ? null : `${path}${qs(query)}`;

  useEffect(() => {
    if (key === null) return;
    const ctrl = new AbortController();
    api.get<T, M>(path!, query, ctrl.signal)
      .then((r) => setRes({ key, data: r.data, meta: r.meta, error: null }))
      .catch((e: unknown) => {
        if ((e as Error).name === "AbortError") return;
        setRes((s) => ({ ...s, key, error: e instanceof Error ? e : new Error("Request failed") }));
      });
    return () => ctrl.abort();
    // `query` is captured through `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  // optional polling (paused while the tab is hidden)
  useEffect(() => {
    if (!opts.pollMs || key === null) return;
    const id = window.setInterval(() => { if (document.visibilityState === "visible") setTick((t) => t + 1); }, opts.pollMs);
    return () => window.clearInterval(id);
  }, [key, opts.pollMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const settled = res.key === key; // does the stored result belong to the request currently asked for?
  const error = settled ? res.error : null;
  return {
    data: key === null ? undefined : res.data, meta: key === null ? undefined : res.meta, error,
    loading: key !== null && res.data === undefined && !error,
    refreshing: key !== null && !settled && res.data !== undefined,
    reload,
  };
}

// ── catalogue taxonomy: tiny module-level cache (categories/brands change rarely) ──
let categoriesPromise: Promise<Category[]> | null = null;
let brandsPromise: Promise<Brand[]> | null = null;

export function useCategories(): Category[] {
  const [value, setValue] = useState<Category[]>([]);
  useEffect(() => {
    categoriesPromise ??= api.get<Category[]>("/categories").then((r) => r.data).catch((e) => { categoriesPromise = null; throw e; });
    let alive = true;
    categoriesPromise.then((c) => alive && setValue(c)).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return value;
}

export function useBrands(): Brand[] {
  const [value, setValue] = useState<Brand[]>([]);
  useEffect(() => {
    brandsPromise ??= api.get<Brand[]>("/brands").then((r) => r.data).catch((e) => { brandsPromise = null; throw e; });
    let alive = true;
    brandsPromise.then((b) => alive && setValue(b)).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return value;
}

/** Leaf-level electronics categories (the root "Electronics" node is only a container). */
export function leafCategories(tree: Category[]): Category[] {
  const out: Category[] = [];
  const walk = (nodes: Category[]) => nodes.forEach((n) => (n.children?.length ? walk(n.children) : out.push(n)));
  walk(tree);
  return out;
}
