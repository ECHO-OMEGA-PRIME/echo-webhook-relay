import { Hono } from 'hono';

const rateLimit = 100; // requests per minute
const timeWindow = 60 * 1000; // 1 minute

export function setupRateLimiting(app: Hono) {
  const cache = new Map<string, number>();

  app.use('*', (c, next) => {
    const ip = c.req.ip;
    const now = Date.now();
    const count = cache.get(ip) || 0;

    if (count >= rateLimit) {
      const lastRequest = cache.get(ip);
      if (lastRequest && now - lastRequest < timeWindow) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }
    }

    cache.set(ip, count + 1);
    cache.set(ip, now);

    return next();
  });
}