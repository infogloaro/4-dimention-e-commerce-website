/**
 * Tiny in-process TTL cache with request coalescing (a stampede of identical misses runs the loader once).
 * Good enough for category trees, settings and dashboards on a single instance; the same `memo` signature
 * can be backed by Redis later without touching callers.
 */
interface Entry<T> {
  value: T;
  expires: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 2_000;

export async function memo<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > Date.now()) return hit.value;
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = loader()
    .then((value) => {
      if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Drop every key that starts with `prefix` (or everything when omitted). */
export function invalidate(prefix = "") {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
