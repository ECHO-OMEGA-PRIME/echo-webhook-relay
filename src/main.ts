import { Hono } from 'hono';
import { setupRoutes } from './routes';
import { setupMiddleware } from './middleware';

const app = new Hono();

setupRoutes(app);
setupMiddleware(app);

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

export { app };