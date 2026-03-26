import { Hono } from 'hono';
import { setupCORS } from './cors';
import { setupRateLimiting } from './rate-limiting';
import { setupAuthentication } from './auth';

export function setupMiddleware(app: Hono) {
  setupCORS(app);
  setupRateLimiting(app);
  setupAuthentication(app);
}