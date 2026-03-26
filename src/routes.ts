import { Hono } from 'hono';
import { setupEchoWebhookRelayRoutes } from './echo-webhook-relay';

export function setupRoutes(app: Hono) {
  setupEchoWebhookRelayRoutes(app);
}