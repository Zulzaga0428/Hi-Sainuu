import type { RequestHandler } from "express";

type Bucket = { count: number; resetAt: number };

const DEFAULT_WINDOW_MS = Number(process.env["RATE_LIMIT_WINDOW_MS"]) || 60_000;
const DEFAULT_MAX = Number(process.env["RATE_LIMIT_MAX"]) || 20;

/**
 * Fixed-window, in-memory per-IP rate limiter.
 *
 * The AI routes spend real money on every call and the API is public, so an
 * unthrottled endpoint is a billing hole. State lives in this process only —
 * fine for the single-instance deploy; move to a shared store if we ever scale
 * horizontally.
 */
export function createRateLimiter(
  options: { windowMs?: number; max?: number } = {},
): RequestHandler {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const max = options.max ?? DEFAULT_MAX;
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  return (req, res, next) => {
    const now = Date.now();

    // Drop expired buckets once per window so the map can't grow unbounded.
    if (now - lastSweep > windowMs) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      lastSweep = now;
    }

    const key = req.ip ?? "unknown";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.set("RateLimit-Limit", String(max));
      res.set("RateLimit-Remaining", String(max - 1));
      next();
      return;
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      req.log.warn({ ip: key, path: req.path }, "Rate limit exceeded");
      res.set("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(max - bucket.count));
    next();
  };
}
