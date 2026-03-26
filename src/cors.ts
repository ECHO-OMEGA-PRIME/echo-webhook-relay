import { Hono } from 'hono';

export function setupCORS(app: Hono) {
  app.use('*', (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    return next();
  });
}