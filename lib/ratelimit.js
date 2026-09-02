// Fixed-window counter per key, held in memory. Fine for one process on one
// box. Across several instances this wants Redis or the like instead.
export class RateLimiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
  }

  check(key, now = Date.now()) {
    const entry = this.hits.get(key);
    if (entry === undefined || now >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.max - 1, retryAfter: 0 };
    }
    if (entry.count >= this.max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      };
    }
    entry.count += 1;
    return { allowed: true, remaining: this.max - entry.count, retryAfter: 0 };
  }

  // Run on an interval so an idle process does not hold keys for ever.
  sweep(now = Date.now()) {
    for (const [key, entry] of this.hits) {
      if (now >= entry.resetAt) this.hits.delete(key);
    }
  }
}
