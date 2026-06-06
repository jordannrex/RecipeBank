/**
 * In-memory sliding window rate limiter.
 *
 * Safe for Railway (single-process Node.js). Not shared across replicas — if
 * horizontal scaling is ever added, replace with a Redis-backed solution.
 */

interface WindowStore {
  hits: number[];  // Unix ms timestamps within the current window
  blocked: boolean;
}

const stores = new Map<string, WindowStore>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // prune stale keys every 5 min

setInterval(() => {
  const now = Date.now();
  for (const [key, store] of stores) {
    // Keep at most one window worth of data for the longest possible window (15 min)
    const cutoff = now - 15 * 60 * 1000;
    store.hits = store.hits.filter((t) => t > cutoff);
    if (store.hits.length === 0 && !store.blocked) {
      stores.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

export interface RateLimitOptions {
  /** Maximum allowed hits in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  /** Remaining hits allowed this window */
  remaining: number;
  /** When the oldest hit in the window expires (ms since epoch) */
  resetAt: number;
}

/**
 * Check and record a hit for `key`.
 *
 * Call with a per-route, per-IP key like `"login:127.0.0.1"`.
 */
export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;

  const store = stores.get(key) ?? { hits: [], blocked: false };
  store.hits = store.hits.filter((t) => t > cutoff);

  const resetAt = store.hits.length > 0 ? store.hits[0] + opts.windowMs : now + opts.windowMs;

  if (store.hits.length >= opts.limit) {
    stores.set(key, store);
    return { success: false, remaining: 0, resetAt };
  }

  store.hits.push(now);
  stores.set(key, store);

  return {
    success: true,
    remaining: opts.limit - store.hits.length,
    resetAt,
  };
}

/**
 * Extract the client IP from a Next.js API Request.
 *
 * Trusts `x-forwarded-for` (set by Railway's proxy). Falls back to a
 * placeholder so rate limiting still works even without a real IP.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}
