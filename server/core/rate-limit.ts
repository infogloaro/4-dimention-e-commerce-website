import { AppError } from "./errors";
import { env } from "./env";

export interface RateLimitPolicy {
  /** Bucket name — different routes with different names never share counters. */
  name: string;
  limit: number;
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/** Storage contract. Swap `MemoryRateLimiter` for a Redis implementation when running multiple instances. */
export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): RateLimitResult | Promise<RateLimitResult>;
  reset?(): void;
}

export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;

  private ensureSweeper() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k);
    }, 60_000);
    this.timer.unref?.();
  }

  hit(key: string, limit: number, windowMs: number): RateLimitResult {
    this.ensureSweeper();
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, b);
    }
    b.count++;
    return { allowed: b.count <= limit, limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
  }

  reset() {
    this.buckets.clear();
  }
}

let limiter: RateLimiter = new MemoryRateLimiter();
export const setRateLimiter = (l: RateLimiter) => (limiter = l);
export const getRateLimiter = () => limiter;

/** Common policies. */
export const RL = {
  read: { name: "read", limit: 300, windowSec: 60 },
  write: { name: "write", limit: 90, windowSec: 60 },
  search: { name: "search", limit: 120, windowSec: 60 },
  auth: { name: "auth", limit: 10, windowSec: 15 * 60 },
  authLogin: { name: "auth-login", limit: 10, windowSec: 15 * 60 },
  sensitive: { name: "sensitive", limit: 5, windowSec: 15 * 60 },
  checkout: { name: "checkout", limit: 20, windowSec: 60 },
  webhook: { name: "webhook", limit: 600, windowSec: 60 },
  admin: { name: "admin", limit: 600, windowSec: 60 },
} satisfies Record<string, RateLimitPolicy>;

export async function enforceRateLimit(policy: RateLimitPolicy, identity: string): Promise<RateLimitResult> {
  if (!env.RATE_LIMIT_ENABLED) {
    return { allowed: true, limit: policy.limit, remaining: policy.limit, resetAt: Date.now() + policy.windowSec * 1000 };
  }
  const res = await limiter.hit(`${policy.name}:${identity}`, policy.limit, policy.windowSec * 1000);
  if (!res.allowed) {
    const retryAfter = Math.max(1, Math.ceil((res.resetAt - Date.now()) / 1000));
    throw new AppError("RATE_LIMITED", "Too many requests. Please slow down.", { retryAfterSec: retryAfter }, {
      "Retry-After": String(retryAfter),
    });
  }
  return res;
}
