import { Router } from 'hono';
import { SHARED_BRAIN } from './bindings/shared-brain';
import { SWARM_BRAIN } from './bindings/swarm-brain';
import { ALERT_ROUTER } from './bindings/alert-router';

export function setupServiceBindings(app: Router) {
  app.bind('SHARED_BRAIN', SHARED_BRAIN);
  app.bind('SWARM_BRAIN', SWARM_BRAIN);
  app.bind('ALERT_ROUTER', ALERT_ROUTER);
}