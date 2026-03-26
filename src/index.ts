/**
 * ECHO WEBHOOK RELAY v2.0.0
 * Centralized webhook management for the ECHO OMEGA PRIME fleet.
 *
 * Features:
 *  - Receive webhooks from GitHub, Vercel, Stripe, Cloudflare, Sentry, custom
 *  - Per-source HMAC signature verification (SHA-256 / SHA-1)
 *  - Subscriber-based fan-out with source + event filters
 *  - Retry with exponential backoff (1s → 4s → 16s), max 3 attempts
 *  - Dead letter queue for permanently failed deliveries
 *  - D1 persistence (webhooks_received, subscribers, deliveries)
 *  - KV hot cache for subscriber lookup
 *  - Cron: retry dead letters, stats+prune, cleanup completed
 *  - /health, /stats, /test, /sign endpoints
 *
 * Auth: X-Echo-API-Key for management endpoints; webhook endpoints use signature verification.
 *
 * @author Echo Prime Technologies
 * @version 2.0.0
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  SHARED_BRAIN: Fetcher;
  ALERT_ROUTER: Fetcher;
  SWARM_BRAIN: Fetcher;
  ECHO_API_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  STRIPE_WEBHOOK_SECRET: string;
  VERCEL_WEBHOOK_SECRET: string;
  SENTRY_WEBHOOK_SECRET: string;
  GENERIC_WEBHOOK_SECRET: string;
}

interface Subscriber {
  id: number;
  name: string;
  url: string;
  source_filter: string;   // comma-separated sources or "*"
  event_filter: string;     // comma-separated event types or "*", supports "prefix.*"
  secret: string | null;    // optional HMAC secret for outbound signing
  custom_headers: string;   // JSON object of extra headers to include
  active: number;
  created_at: string;
  updated_at: string;
}

interface NormalizedWebhook {
  source: string;
  event_type: string;
  payload: unknown;
  timestamp: string;
  signature_valid: boolean;
  raw_headers: Record<string, string>;
}

interface DeliveryRecord {
  id: number;
  webhook_id: number;
  subscriber_id: number;
  status: string;
  response_code: number | null;
  response_body: string | null;
  attempt: number;
  next_retry_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const VERSION = '2.0.0';
const MAX_RETRIES = 3;
const BACKOFF_BASE = 1;            // seconds
const BACKOFF_MULTIPLIER = 4;      // 1s, 4s, 16s
const DELIVERY_TIMEOUT_MS = 15_000;
const SUBSCRIBER_CACHE_TTL = 300;  // 5 minutes
const VALID_SOURCES = ['github', 'vercel', 'stripe', 'cloudflare', 'sentry', 'custom'] as const;
type WebhookSource = typeof VALID_SOURCES[number];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Echo-API-Key, Authorization',
    },
  });
}

function log(level: string, message: string, meta: Record<string, unknown> = {}): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: 'echo-webhook-relay',
    version: VERSION,
    message,
    ...meta,
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

function checkAuth(request: Request, env: Env): boolean {
  const key = request.headers.get('X-Echo-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
  return key === env.ECHO_API_KEY;
}

function cors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Echo-API-Key, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function headersToRecord(headers: Headers): Record<string, string> {
  const rec: Record<string, string> = {};
  headers.forEach((v, k) => { rec[k] = v; });
  return rec;
}

/** Timing-safe comparison of two hex strings. */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  const key = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, bufA),
    crypto.subtle.sign('HMAC', key, bufB),
  ]);
  const viewA = new Uint8Array(sigA);
  const viewB = new Uint8Array(sigB);
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) diff |= viewA[i] ^ viewB[i];
  return diff === 0;
}

function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature Verification — Per Source
// ─────────────────────────────────────────────────────────────────────────────

async function hmacSign(algorithm: string, secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return hexEncode(sig);
}

/**
 * GitHub: X-Hub-Signature-256 = "sha256=<hex>"
 */
async function verifyGitHubSignature(body: string, headers: Headers, secret: string): Promise<boolean> {
  const sig = headers.get('X-Hub-Signature-256');
  if (!sig) return false;
  const expected = sig.replace('sha256=', '');
  const computed = await hmacSign('SHA-256', secret, body);
  return timingSafeEqual(computed, expected);
}

/**
 * Stripe: Stripe-Signature = "t=<timestamp>,v1=<hex>,v1=<hex>"
 * Signed payload = "<timestamp>.<body>"
 */
async function verifyStripeSignature(body: string, headers: Headers, secret: string): Promise<boolean> {
  const sig = headers.get('Stripe-Signature');
  if (!sig) return false;

  const parts: Record<string, string[]> = {};
  for (const item of sig.split(',')) {
    const [k, v] = item.split('=', 2);
    if (!parts[k]) parts[k] = [];
    parts[k].push(v);
  }
  const timestamp = parts['t']?.[0];
  const signatures = parts['v1'] || [];
  if (!timestamp || signatures.length === 0) return false;

  // Reject if timestamp is older than 5 minutes
  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (age > 300) {
    log('warn', 'Stripe signature timestamp too old', { age_seconds: age });
    return false;
  }

  const signedPayload = `${timestamp}.${body}`;
  const computed = await hmacSign('SHA-256', secret, signedPayload);

  for (const s of signatures) {
    if (await timingSafeEqual(computed, s)) return true;
  }
  return false;
}

/**
 * Vercel: x-vercel-signature = "<hex>" (HMAC-SHA1)
 */
async function verifyVercelSignature(body: string, headers: Headers, secret: string): Promise<boolean> {
  const sig = headers.get('x-vercel-signature');
  if (!sig) return false;
  const computed = await hmacSign('SHA-1', secret, body);
  return timingSafeEqual(computed, sig);
}

/**
 * Sentry: sentry-hook-signature = "<hex>" (HMAC-SHA256)
 */
async function verifySentrySignature(body: string, headers: Headers, secret: string): Promise<boolean> {
  const sig = headers.get('sentry-hook-signature');
  if (!sig) return false;
  const computed = await hmacSign('SHA-256', secret, body);
  return timingSafeEqual(computed, sig);
}

/**
 * Generic / Cloudflare / Custom: X-Webhook-Signature = "sha256=<hex>" or just "<hex>"
 */
async function verifyGenericSignature(body: string, headers: Headers, secret: string): Promise<boolean> {
  const raw = headers.get('X-Webhook-Signature') || headers.get('CF-Webhook-Signature');
  if (!raw) return false;
  const sig = raw.replace('sha256=', '');
  const computed = await hmacSign('SHA-256', secret, body);
  return timingSafeEqual(computed, sig);
}

/** Route to correct verifier by source. Returns true if verified OR no secret configured. */
async function verifySignature(source: string, body: string, headers: Headers, env: Env): Promise<boolean> {
  const secretMap: Record<string, string | undefined> = {
    github: env.GITHUB_WEBHOOK_SECRET,
    stripe: env.STRIPE_WEBHOOK_SECRET,
    vercel: env.VERCEL_WEBHOOK_SECRET,
    sentry: env.SENTRY_WEBHOOK_SECRET,
    cloudflare: env.GENERIC_WEBHOOK_SECRET,
    custom: env.GENERIC_WEBHOOK_SECRET,
  };
  const secret = secretMap[source];
  if (!secret) {
    log('warn', 'No webhook secret configured, skipping verification', { source });
    return true; // allow if no secret configured
  }

  const verifiers: Record<string, (b: string, h: Headers, s: string) => Promise<boolean>> = {
    github: verifyGitHubSignature,
    stripe: verifyStripeSignature,
    vercel: verifyVercelSignature,
    sentry: verifySentrySignature,
    cloudflare: verifyGenericSignature,
    custom: verifyGenericSignature,
  };
  const verifier = verifiers[source];
  if (!verifier) return false;

  try {
    return await verifier(body, headers, secret);
  } catch (err) {
    log('error', 'Signature verification error', { source, error: String(err) });
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Type Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractEventType(source: string, headers: Headers, payload: Record<string, unknown>): string {
  switch (source) {
    case 'github': {
      const event = headers.get('X-GitHub-Event') || 'unknown';
      const action = typeof payload.action === 'string' ? payload.action : '';
      return action ? `${event}.${action}` : event;
    }
    case 'stripe': {
      return typeof payload.type === 'string' ? payload.type : 'unknown';
    }
    case 'vercel': {
      const vtype = typeof payload.type === 'string' ? payload.type : 'unknown';
      return `vercel.${vtype}`;
    }
    case 'sentry': {
      const resource = headers.get('sentry-hook-resource') || 'unknown';
      const action = typeof payload.action === 'string' ? payload.action : '';
      return action ? `${resource}.${action}` : resource;
    }
    case 'cloudflare': {
      return headers.get('CF-Webhook-Event') || typeof payload.event === 'string' ? (payload.event as string) : 'unknown';
    }
    case 'custom':
    default: {
      // Try common field names
      for (const key of ['event', 'event_type', 'type', 'action']) {
        if (typeof payload[key] === 'string') return payload[key] as string;
      }
      return 'unknown';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscriber Matching
// ─────────────────────────────────────────────────────────────────────────────

function subscriberMatchesSource(sub: Subscriber, source: string): boolean {
  if (sub.source_filter === '*') return true;
  const sources = sub.source_filter.split(',').map(s => s.trim().toLowerCase());
  return sources.includes(source.toLowerCase());
}

function subscriberMatchesEvent(sub: Subscriber, eventType: string): boolean {
  if (sub.event_filter === '*') return true;
  const filters = sub.event_filter.split(',').map(f => f.trim().toLowerCase());
  const lower = eventType.toLowerCase();
  for (const filter of filters) {
    if (filter === lower) return true;
    // Wildcard suffix: "push.*" matches "push.created", "push" etc.
    if (filter.endsWith('.*')) {
      const prefix = filter.slice(0, -2);
      if (lower === prefix || lower.startsWith(prefix + '.')) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscriber Cache
// ─────────────────────────────────────────────────────────────────────────────

async function getActiveSubscribers(env: Env): Promise<Subscriber[]> {
  const cacheKey = 'subscribers:active';
  const cached = await env.CACHE.get(cacheKey, 'json');
  if (cached) return cached as Subscriber[];

  const result = await env.DB.prepare('SELECT * FROM subscribers WHERE active = 1').all<Subscriber>();
  const subs = result.results || [];
  await env.CACHE.put(cacheKey, JSON.stringify(subs), { expirationTtl: SUBSCRIBER_CACHE_TTL });
  return subs;
}

async function invalidateSubscriberCache(env: Env): Promise<void> {
  await env.CACHE.delete('subscribers:active');
}

// ─────────────────────────────────────────────────────────────────────────────
// Fan-Out Delivery Engine
// ─────────────────────────────────────────────────────────────────────────────

async function deliverToSubscriber(
  sub: Subscriber,
  webhook: NormalizedWebhook,
  webhookId: number,
  env: Env,
): Promise<void> {
  const deliveryPayload = JSON.stringify({
    webhook_id: webhookId,
    source: webhook.source,
    event_type: webhook.event_type,
    payload: webhook.payload,
    timestamp: webhook.timestamp,
  });

  let customHeaders: Record<string, string> = {};
  try {
    if (sub.custom_headers) customHeaders = JSON.parse(sub.custom_headers);
  } catch { /* ignore parse errors */ }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'EchoWebhookRelay/2.0.0',
    'X-Webhook-Relay-Source': webhook.source,
    'X-Webhook-Relay-Event': webhook.event_type,
    'X-Webhook-Relay-Delivery': String(webhookId),
    ...customHeaders,
  };

  // Sign outbound payload if subscriber has a secret
  if (sub.secret) {
    const sig = await hmacSign('SHA-256', sub.secret, deliveryPayload);
    headers['X-Webhook-Signature'] = `sha256=${sig}`;
  }

  const startMs = Date.now();
  let status = 'delivered';
  let responseCode: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const resp = await fetch(sub.url, {
      method: 'POST',
      headers,
      body: deliveryPayload,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    responseCode = resp.status;
    responseBody = (await resp.text()).slice(0, 1000); // truncate large responses

    if (resp.status >= 200 && resp.status < 300) {
      status = 'delivered';
    } else {
      status = 'failed';
      error = `HTTP ${resp.status}`;
    }
  } catch (err) {
    status = 'failed';
    error = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = Date.now() - startMs;
  log(status === 'delivered' ? 'info' : 'warn', `Delivery to ${sub.name}: ${status}`, {
    subscriber_id: sub.id,
    webhook_id: webhookId,
    response_code: responseCode,
    latency_ms: latencyMs,
    error,
  });

  // Record delivery
  await env.DB.prepare(`
    INSERT INTO deliveries (webhook_id, subscriber_id, status, response_code, response_body, attempt, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
  `).bind(webhookId, sub.id, status, responseCode, responseBody, error).run();

  // If failed, schedule retry
  if (status === 'failed') {
    const deliveryResult = await env.DB.prepare(
      'SELECT id FROM deliveries WHERE webhook_id = ? AND subscriber_id = ? ORDER BY id DESC LIMIT 1'
    ).bind(webhookId, sub.id).first<{ id: number }>();
    if (deliveryResult) {
      await markDeliveryForRetry(deliveryResult.id, 1, env);
    }
  }
}

async function fanOut(webhook: NormalizedWebhook, webhookId: number, env: Env): Promise<{ total: number; matched: number }> {
  const subscribers = await getActiveSubscribers(env);
  const matched = subscribers.filter(
    sub => subscriberMatchesSource(sub, webhook.source) && subscriberMatchesEvent(sub, webhook.event_type),
  );

  log('info', 'Fan-out initiated', {
    webhook_id: webhookId,
    source: webhook.source,
    event_type: webhook.event_type,
    total_subscribers: subscribers.length,
    matched_subscribers: matched.length,
  });

  // Parallel delivery
  const results = await Promise.allSettled(
    matched.map(sub => deliverToSubscriber(sub, webhook, webhookId, env)),
  );

  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) {
    log('warn', `${failed} delivery promises rejected`, { webhook_id: webhookId });
  }

  return { total: subscribers.length, matched: matched.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Logic — Exponential Backoff
// ─────────────────────────────────────────────────────────────────────────────

function computeBackoff(attempt: number): number {
  // 1s, 4s, 16s
  return BACKOFF_BASE * Math.pow(BACKOFF_MULTIPLIER, attempt - 1);
}

async function markDeliveryForRetry(deliveryId: number, currentAttempt: number, env: Env): Promise<void> {
  if (currentAttempt >= MAX_RETRIES) {
    // Move to dead letter
    await env.DB.prepare(
      "UPDATE deliveries SET status = 'dead_letter', updated_at = datetime('now') WHERE id = ?"
    ).bind(deliveryId).run();
    log('warn', 'Delivery moved to dead letter queue', { delivery_id: deliveryId, attempts: currentAttempt });
    return;
  }

  const backoffSeconds = computeBackoff(currentAttempt + 1);
  const nextRetry = new Date(Date.now() + backoffSeconds * 1000).toISOString();

  await env.DB.prepare(
    "UPDATE deliveries SET status = 'pending_retry', next_retry_at = ?, attempt = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(nextRetry, currentAttempt + 1, deliveryId).run();

  log('info', 'Delivery scheduled for retry', {
    delivery_id: deliveryId,
    attempt: currentAttempt + 1,
    backoff_seconds: backoffSeconds,
    next_retry_at: nextRetry,
  });
}

async function retryDelivery(delivery: DeliveryRecord, env: Env): Promise<void> {
  // Fetch the original webhook and subscriber
  const webhook = await env.DB.prepare('SELECT * FROM webhooks_received WHERE id = ?').bind(delivery.webhook_id).first();
  const sub = await env.DB.prepare('SELECT * FROM subscribers WHERE id = ?').bind(delivery.subscriber_id).first<Subscriber>();

  if (!webhook || !sub) {
    await env.DB.prepare(
      "UPDATE deliveries SET status = 'dead_letter', error = 'Missing webhook or subscriber', updated_at = datetime('now') WHERE id = ?"
    ).bind(delivery.id).run();
    return;
  }

  const payload = JSON.stringify({
    webhook_id: delivery.webhook_id,
    source: webhook.source,
    event_type: webhook.event_type,
    payload: JSON.parse(webhook.payload as string || '{}'),
    timestamp: webhook.received_at,
  });

  let customHeaders: Record<string, string> = {};
  try {
    if (sub.custom_headers) customHeaders = JSON.parse(sub.custom_headers);
  } catch { /* ignore */ }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'EchoWebhookRelay/2.0.0 (retry)',
    'X-Webhook-Relay-Source': webhook.source as string,
    'X-Webhook-Relay-Event': webhook.event_type as string,
    'X-Webhook-Relay-Delivery': String(delivery.webhook_id),
    'X-Webhook-Relay-Retry': String(delivery.attempt),
    ...customHeaders,
  };

  if (sub.secret) {
    const sig = await hmacSign('SHA-256', sub.secret, payload);
    headers['X-Webhook-Signature'] = `sha256=${sig}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    const resp = await fetch(sub.url, { method: 'POST', headers, body: payload, signal: controller.signal });
    clearTimeout(timeout);

    if (resp.status >= 200 && resp.status < 300) {
      await env.DB.prepare(
        "UPDATE deliveries SET status = 'delivered', response_code = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(resp.status, delivery.id).run();
      log('info', 'Retry delivery succeeded', { delivery_id: delivery.id, attempt: delivery.attempt });
    } else {
      const body = (await resp.text()).slice(0, 500);
      await env.DB.prepare(
        "UPDATE deliveries SET response_code = ?, response_body = ?, error = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(resp.status, body, `HTTP ${resp.status}`, delivery.id).run();
      await markDeliveryForRetry(delivery.id, delivery.attempt, env);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await env.DB.prepare(
      "UPDATE deliveries SET error = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(errMsg, delivery.id).run();
    await markDeliveryForRetry(delivery.id, delivery.attempt, env);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// D1 Schema
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  source_filter TEXT NOT NULL DEFAULT '*',
  event_filter TEXT NOT NULL DEFAULT '*',
  secret TEXT,
  custom_headers TEXT DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhooks_received (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  headers TEXT,
  signature_valid INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT,
  received_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_webhooks_source ON webhooks_received(source, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhooks_event ON webhooks_received(event_type, received_at DESC);

CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id INTEGER NOT NULL,
  subscriber_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  response_code INTEGER,
  response_body TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  next_retry_at TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (webhook_id) REFERENCES webhooks_received(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_webhook ON deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_subscriber ON deliveries(subscriber_id);
`;

async function ensureSchema(env: Env): Promise<void> {
  const statements = SCHEMA_SQL.split(';').map(s => s.trim()).filter(Boolean);
  for (const sql of statements) {
    await env.DB.prepare(sql).run();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Handlers
// ─────────────────────────────────────────────────────────────────────────────

/** POST /webhook/:source — Receive a webhook */
async function handleWebhookReceive(
  request: Request,
  source: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!VALID_SOURCES.includes(source as WebhookSource)) {
    return json({ error: `Invalid source: ${source}. Valid: ${VALID_SOURCES.join(', ')}` }, 400);
  }

  const body = await request.text();
  if (!body) return json({ error: 'Empty body' }, 400);

  // Verify signature
  const signatureValid = await verifySignature(source, body, request.headers, env);
  if (!signatureValid) {
    log('warn', 'Webhook signature verification failed', { source, ip: request.headers.get('CF-Connecting-IP') });
    return json({ error: 'Signature verification failed' }, 401);
  }

  // Parse payload
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = { raw: body };
  }

  // Extract event type
  const eventType = extractEventType(source, request.headers, payload);

  // Normalize
  const normalized: NormalizedWebhook = {
    source,
    event_type: eventType,
    payload,
    timestamp: new Date().toISOString(),
    signature_valid: signatureValid,
    raw_headers: headersToRecord(request.headers),
  };

  // Store in D1
  const storeResult = await env.DB.prepare(`
    INSERT INTO webhooks_received (source, event_type, payload, headers, signature_valid, ip_address, received_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    source,
    eventType,
    JSON.stringify(payload),
    JSON.stringify(normalized.raw_headers),
    signatureValid ? 1 : 0,
    request.headers.get('CF-Connecting-IP') || 'unknown',
  ).run();

  const webhookId = storeResult.meta?.last_row_id || 0;
  log('info', 'Webhook received and stored', { webhook_id: webhookId, source, event_type: eventType });

  // Fan out in background
  ctx.waitUntil(
    fanOut(normalized, webhookId, env).catch(err => {
      log('error', 'Fan-out error', { webhook_id: webhookId, error: String(err) });
    }),
  );

  return json({
    accepted: true,
    webhook_id: webhookId,
    source,
    event_type: eventType,
    signature_valid: signatureValid,
  }, 202);
}

/** POST /subscribers — Create subscriber */
async function handleCreateSubscriber(request: Request, env: Env): Promise<Response> {
  const body = await request.json<Partial<Subscriber>>();
  if (!body.name || !body.url) {
    return json({ error: 'name and url are required' }, 400);
  }

  try {
    new URL(body.url);
  } catch {
    return json({ error: 'Invalid url' }, 400);
  }

  const result = await env.DB.prepare(`
    INSERT INTO subscribers (name, url, source_filter, event_filter, secret, custom_headers, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `).bind(
    body.name,
    body.url,
    body.source_filter || '*',
    body.event_filter || '*',
    body.secret || null,
    body.custom_headers ? JSON.stringify(body.custom_headers) : '{}',
  ).run();

  await invalidateSubscriberCache(env);
  const id = result.meta?.last_row_id || 0;
  log('info', 'Subscriber created', { subscriber_id: id, name: body.name });

  return json({ id, name: body.name, url: body.url, source_filter: body.source_filter || '*', event_filter: body.event_filter || '*' }, 201);
}

/** GET /subscribers — List subscribers */
async function handleListSubscribers(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT * FROM subscribers ORDER BY created_at DESC').all<Subscriber>();
  return json({ subscribers: result.results || [], count: result.results?.length || 0 });
}

/** GET /subscribers/:id — Get single subscriber */
async function handleGetSubscriber(id: string, env: Env): Promise<Response> {
  const sub = await env.DB.prepare('SELECT * FROM subscribers WHERE id = ?').bind(parseInt(id, 10)).first<Subscriber>();
  if (!sub) return json({ error: 'Subscriber not found' }, 404);
  return json(sub);
}

/** PUT /subscribers/:id — Update subscriber */
async function handleUpdateSubscriber(id: string, request: Request, env: Env): Promise<Response> {
  const numId = parseInt(id, 10);
  const existing = await env.DB.prepare('SELECT * FROM subscribers WHERE id = ?').bind(numId).first<Subscriber>();
  if (!existing) return json({ error: 'Subscriber not found' }, 404);

  const body = await request.json<Partial<Subscriber>>();

  await env.DB.prepare(`
    UPDATE subscribers SET
      name = ?, url = ?, source_filter = ?, event_filter = ?, secret = ?,
      custom_headers = ?, active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.name ?? existing.name,
    body.url ?? existing.url,
    body.source_filter ?? existing.source_filter,
    body.event_filter ?? existing.event_filter,
    body.secret !== undefined ? body.secret : existing.secret,
    body.custom_headers ? JSON.stringify(body.custom_headers) : existing.custom_headers,
    body.active !== undefined ? body.active : existing.active,
    numId,
  ).run();

  await invalidateSubscriberCache(env);
  log('info', 'Subscriber updated', { subscriber_id: numId });
  return json({ id: numId, updated: true });
}

/** DELETE /subscribers/:id — Delete subscriber */
async function handleDeleteSubscriber(id: string, env: Env): Promise<Response> {
  const numId = parseInt(id, 10);
  await env.DB.prepare('DELETE FROM subscribers WHERE id = ?').bind(numId).run();
  await invalidateSubscriberCache(env);
  log('info', 'Subscriber deleted', { subscriber_id: numId });
  return json({ id: numId, deleted: true });
}

/** GET /webhooks — List received webhooks (paginated) */
async function handleListWebhooks(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const source = url.searchParams.get('source');

  let sql = 'SELECT * FROM webhooks_received';
  const params: unknown[] = [];
  if (source) {
    sql += ' WHERE source = ?';
    params.push(source);
  }
  sql += ' ORDER BY received_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await env.DB.prepare(sql).bind(...params).all();
  return json({ webhooks: result.results || [], count: result.results?.length || 0, limit, offset });
}

/** GET /webhooks/:id — Get single webhook with deliveries */
async function handleGetWebhook(id: string, env: Env): Promise<Response> {
  const numId = parseInt(id, 10);
  const webhook = await env.DB.prepare('SELECT * FROM webhooks_received WHERE id = ?').bind(numId).first();
  if (!webhook) return json({ error: 'Webhook not found' }, 404);

  const deliveries = await env.DB.prepare(
    'SELECT * FROM deliveries WHERE webhook_id = ? ORDER BY created_at DESC'
  ).bind(numId).all();

  return json({ webhook, deliveries: deliveries.results || [] });
}

/** GET /deliveries — List deliveries (paginated, filterable) */
async function handleListDeliveries(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const status = url.searchParams.get('status');

  let sql = 'SELECT * FROM deliveries';
  const params: unknown[] = [];
  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await env.DB.prepare(sql).bind(...params).all();
  return json({ deliveries: result.results || [], count: result.results?.length || 0, limit, offset });
}

/** GET /dead-letter — List dead-letter deliveries */
async function handleDeadLetter(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT d.*, w.source, w.event_type, s.name as subscriber_name, s.url as subscriber_url FROM deliveries d JOIN webhooks_received w ON d.webhook_id = w.id JOIN subscribers s ON d.subscriber_id = s.id WHERE d.status = 'dead_letter' ORDER BY d.updated_at DESC LIMIT 100"
  ).all();
  return json({ dead_letters: result.results || [], count: result.results?.length || 0 });
}

/** POST /dead-letter/:id/retry — Retry a dead-letter delivery */
async function handleRetryDeadLetter(id: string, env: Env): Promise<Response> {
  const numId = parseInt(id, 10);
  const delivery = await env.DB.prepare(
    "SELECT * FROM deliveries WHERE id = ? AND status = 'dead_letter'"
  ).bind(numId).first<DeliveryRecord>();

  if (!delivery) return json({ error: 'Dead letter delivery not found' }, 404);

  // Reset to pending_retry with attempt 1
  await env.DB.prepare(
    "UPDATE deliveries SET status = 'pending_retry', attempt = 1, next_retry_at = datetime('now'), error = NULL, updated_at = datetime('now') WHERE id = ?"
  ).bind(numId).run();

  log('info', 'Dead letter delivery reset for retry', { delivery_id: numId });
  return json({ id: numId, status: 'pending_retry', message: 'Retry scheduled' });
}

/** GET /stats — Relay statistics */
async function handleStats(env: Env): Promise<Response> {
  const today = new Date().toISOString().split('T')[0];

  const [totalWebhooks, todayWebhooks, totalDeliveries, deliveryStats, subscriberCount, sourceBreakdown] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM webhooks_received').first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) as count FROM webhooks_received WHERE received_at >= ?").bind(today).first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM deliveries').first<{ count: number }>(),
    env.DB.prepare("SELECT status, COUNT(*) as count FROM deliveries GROUP BY status").all<{ status: string; count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM subscribers WHERE active = 1').first<{ count: number }>(),
    env.DB.prepare("SELECT source, COUNT(*) as count FROM webhooks_received GROUP BY source ORDER BY count DESC").all<{ source: string; count: number }>(),
  ]);

  const statusMap: Record<string, number> = {};
  for (const row of deliveryStats.results || []) {
    statusMap[row.status] = row.count;
  }

  return json({
    version: VERSION,
    uptime: 'cloudflare',
    total_webhooks_received: totalWebhooks?.count || 0,
    webhooks_today: todayWebhooks?.count || 0,
    total_deliveries: totalDeliveries?.count || 0,
    delivery_status: statusMap,
    active_subscribers: subscriberCount?.count || 0,
    source_breakdown: sourceBreakdown.results || [],
    dead_letter_count: statusMap['dead_letter'] || 0,
    pending_retry_count: statusMap['pending_retry'] || 0,
  });
}

/** GET /health — Health check */
async function handleHealth(env: Env): Promise<Response> {
  const start = Date.now();
  let dbOk = false;
  try {
    await env.DB.prepare('SELECT 1').first();
    dbOk = true;
  } catch { /* db down */ }

  let kvOk = false;
  try {
    await env.CACHE.put('__health_check', '1', { expirationTtl: 60 });
    kvOk = true;
  } catch { /* kv down */ }

  return json({
    status: dbOk && kvOk ? 'ok' : 'degraded',
    version: VERSION,
    timestamp: new Date().toISOString(),
    latency_ms: Date.now() - start,
    dependencies: {
      d1: dbOk ? 'ok' : 'down',
      kv: kvOk ? 'ok' : 'down',
    },
  });
}

/** POST /test — Send a test webhook internally */
async function handleTest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await request.json<{ source?: string; event_type?: string; payload?: unknown }>();
  const source = body.source || 'custom';
  const eventType = body.event_type || 'test.ping';
  const payload = body.payload || { test: true, timestamp: new Date().toISOString() };

  const normalized: NormalizedWebhook = {
    source,
    event_type: eventType,
    payload,
    timestamp: new Date().toISOString(),
    signature_valid: true,
    raw_headers: { 'x-test': 'true' },
  };

  const storeResult = await env.DB.prepare(`
    INSERT INTO webhooks_received (source, event_type, payload, headers, signature_valid, ip_address, received_at)
    VALUES (?, ?, ?, '{"x-test":"true"}', 1, 'test', datetime('now'))
  `).bind(source, eventType, JSON.stringify(payload)).run();

  const webhookId = storeResult.meta?.last_row_id || 0;
  ctx.waitUntil(fanOut(normalized, webhookId, env));

  return json({ test: true, webhook_id: webhookId, source, event_type: eventType }, 201);
}

/** POST /sign — Generate a signature for a payload (useful for testing) */
async function handleSign(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ payload: string; secret?: string; algorithm?: string }>();
  if (!body.payload) return json({ error: 'payload is required' }, 400);

  const secret = body.secret || env.GENERIC_WEBHOOK_SECRET || 'default-secret';
  const algorithm = body.algorithm === 'SHA-1' ? 'SHA-1' : 'SHA-256';
  const signature = await hmacSign(algorithm, secret, body.payload);

  return json({
    signature,
    header_value: `sha256=${signature}`,
    algorithm,
  });
}

/** POST /schema/init — Initialize D1 schema (admin) */
async function handleSchemaInit(env: Env): Promise<Response> {
  await ensureSchema(env);
  return json({ initialized: true, tables: ['subscribers', 'webhooks_received', 'deliveries'] });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron Handlers
// ─────────────────────────────────────────────────────────────────────────────

/** Cron: Retry dead letters and pending retries (every 15 minutes) */
async function cronRetryDeadLetters(env: Env): Promise<void> {
  const now = new Date().toISOString();
  const pending = await env.DB.prepare(
    "SELECT * FROM deliveries WHERE status = 'pending_retry' AND next_retry_at <= ? ORDER BY next_retry_at ASC LIMIT 50"
  ).bind(now).all<DeliveryRecord>();

  const items = pending.results || [];
  log('info', 'Cron: retry dead letters', { pending_count: items.length });

  for (const delivery of items) {
    try {
      await retryDelivery(delivery, env);
    } catch (err) {
      log('error', 'Cron retry error', { delivery_id: delivery.id, error: String(err) });
    }
  }
}

/** Cron: Stats + prune old webhooks (every 6 hours, prune >30 days) */
async function cronStatsAndPrune(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Delete old deliveries first (foreign key)
  const delDeliveries = await env.DB.prepare(
    "DELETE FROM deliveries WHERE webhook_id IN (SELECT id FROM webhooks_received WHERE received_at < ?)"
  ).bind(cutoff).run();

  // Then delete old webhooks
  const delWebhooks = await env.DB.prepare(
    "DELETE FROM webhooks_received WHERE received_at < ?"
  ).bind(cutoff).run();

  log('info', 'Cron: stats and prune', {
    pruned_webhooks: delWebhooks.meta?.changes || 0,
    pruned_deliveries: delDeliveries.meta?.changes || 0,
    cutoff,
  });

  // Post stats to Shared Brain
  try {
    const stats = await env.DB.prepare('SELECT COUNT(*) as count FROM webhooks_received').first<{ count: number }>();
    const deadCount = await env.DB.prepare("SELECT COUNT(*) as count FROM deliveries WHERE status = 'dead_letter'").first<{ count: number }>();

    await env.SHARED_BRAIN.fetch('https://brain/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instance_id: 'echo-webhook-relay',
        role: 'system',
        content: `WEBHOOK RELAY STATS: ${stats?.count || 0} total webhooks, ${deadCount?.count || 0} dead letters. Pruned records older than 30 days.`,
        importance: 5,
        tags: ['webhook-relay', 'stats'],
      }),
    });
  } catch (err) {
    log('warn', 'Failed to post stats to Shared Brain', { error: String(err) });
  }
}

/** Cron: Cleanup completed deliveries older than 7 days (daily at 3am) */
async function cronCleanupCompleted(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await env.DB.prepare(
    "DELETE FROM deliveries WHERE status = 'delivered' AND created_at < ?"
  ).bind(cutoff).run();

  log('info', 'Cron: cleanup completed deliveries', { deleted: result.meta?.changes || 0, cutoff });
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS preflight
  if (method === 'OPTIONS') return cors();

  // Health — no auth
  if (path === '/health' && method === 'GET') return handleHealth(env);

  // Webhook receive — uses signature verification, not API key
  const webhookMatch = path.match(/^\/webhook\/([a-z]+)$/);
  if (webhookMatch && method === 'POST') {
    return handleWebhookReceive(request, webhookMatch[1], env, ctx);
  }

  // All other endpoints require API key auth
  if (!checkAuth(request, env)) {
    return json({ error: 'Unauthorized. Provide X-Echo-API-Key header.' }, 401);
  }

  // Schema init
  if (path === '/schema/init' && method === 'POST') return handleSchemaInit(env);

  // Subscribers CRUD
  if (path === '/subscribers' && method === 'POST') return handleCreateSubscriber(request, env);
  if (path === '/subscribers' && method === 'GET') return handleListSubscribers(env);
  const subMatch = path.match(/^\/subscribers\/(\d+)$/);
  if (subMatch) {
    if (method === 'GET') return handleGetSubscriber(subMatch[1], env);
    if (method === 'PUT') return handleUpdateSubscriber(subMatch[1], request, env);
    if (method === 'DELETE') return handleDeleteSubscriber(subMatch[1], env);
  }

  // Webhooks
  if (path === '/webhooks' && method === 'GET') return handleListWebhooks(request, env);
  const whMatch = path.match(/^\/webhooks\/(\d+)$/);
  if (whMatch && method === 'GET') return handleGetWebhook(whMatch[1], env);

  // Deliveries
  if (path === '/deliveries' && method === 'GET') return handleListDeliveries(request, env);

  // Dead letter
  if (path === '/dead-letter' && method === 'GET') return handleDeadLetter(env);
  const dlMatch = path.match(/^\/dead-letter\/(\d+)\/retry$/);
  if (dlMatch && method === 'POST') return handleRetryDeadLetter(dlMatch[1], env);

  // Stats
  if (path === '/stats' && method === 'GET') return handleStats(env);

  // Test
  if (path === '/test' && method === 'POST') return handleTest(request, env, ctx);

  // Sign
  if (path === '/sign' && method === 'POST') return handleSign(request, env);

  return json({ error: 'Not found', path }, 404);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron Router
// ─────────────────────────────────────────────────────────────────────────────

async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  await ensureSchema(env);

  const hour = new Date(event.scheduledTime).getUTCHours();
  const minute = new Date(event.scheduledTime).getUTCMinutes();

  log('info', 'Cron triggered', { cron: event.cron, hour, minute });

  // */15 * * * * — Retry dead letters
  if (event.cron === '*/15 * * * *') {
    ctx.waitUntil(cronRetryDeadLetters(env));
    return;
  }

  // 0 */6 * * * — Stats and prune
  if (event.cron === '0 */6 * * *') {
    ctx.waitUntil(cronStatsAndPrune(env));
    return;
  }

  // 0 3 * * * — Cleanup completed
  if (event.cron === '0 3 * * *') {
    ctx.waitUntil(cronCleanupCompleted(env));
    return;
  }

  log('warn', 'Unknown cron trigger', { cron: event.cron });
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      await ensureSchema(env);
      return await handleRequest(request, env, ctx);
    } catch (err) {
      log('error', 'Unhandled error', { error: String(err), stack: (err as Error)?.stack });
      return json({ error: 'Internal server error', message: String(err) }, 500);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      await handleScheduled(event, env, ctx);
    } catch (err) {
      log('error', 'Cron unhandled error', { error: String(err), cron: event.cron });
    }
  },
};
