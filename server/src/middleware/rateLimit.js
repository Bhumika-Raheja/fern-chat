/**
 * Creates a fixed-window in-memory rate-limiting Express middleware.
 */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 30,
  message = "Too many requests. Please try again later.",
  keyGenerator = (req) => req.ip || req.headers?.["x-forwarded-for"] || "unknown",
} = {}) {
  const hits = new Map();

  function prune(now) {
    if (hits.size <= 1000) return;
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  function middleware(req, res, next) {
    const now = Date.now();
    prune(now);

    const key = String(keyGenerator(req) || "unknown");
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    if (entry.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader?.("Retry-After", String(retryAfter));
      res.setHeader?.("X-RateLimit-Limit", String(max));
      res.setHeader?.("X-RateLimit-Remaining", "0");
      return res.status(429).json({ message });
    }

    entry.count += 1;
    res.setHeader?.("X-RateLimit-Limit", String(max));
    res.setHeader?.("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    return next();
  }

  middleware.reset = () => hits.clear();
  return middleware;
}
