import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const logger = console;

function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(payload);
}

async function fetchJson(url, options = {}, timeoutMs = 2500) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function rabbitAuth() {
  return `Basic ${Buffer.from(`${config.rabbitUser}:${config.rabbitPassword}`).toString('base64')}`;
}

async function collectHealth() {
  const checks = config.services.map(async (service) => {
    const startedAt = Date.now();
    try {
      const data = await fetchJson(`${service.url}/health`);
      return {
        name: service.name,
        ok: data.status === 'ok',
        status: data.status,
        broker: data.broker,
        uptimeSeconds: data.uptimeSeconds,
        latencyMs: Date.now() - startedAt
      };
    } catch (err) {
      return {
        name: service.name,
        ok: false,
        status: 'unreachable',
        broker: 'unknown',
        error: err.message,
        latencyMs: Date.now() - startedAt
      };
    }
  });

  const rabbitCheck = (async () => {
    try {
      const overview = await fetchJson(
        `${config.rabbitManagementUrl}/api/overview`,
        { headers: { authorization: rabbitAuth() } },
        2500
      );
      return {
        ok: true,
        status: 'running',
        node: overview.node,
        rabbitmqVersion: overview.rabbitmq_version,
        queues: overview.object_totals?.queues,
        connections: overview.object_totals?.connections,
        messages: overview.queue_totals?.messages
      };
    } catch (err) {
      return { ok: false, status: 'unreachable', error: err.message };
    }
  })();

  const [services, rabbit] = await Promise.all([Promise.all(checks), rabbitCheck]);
  return {
    gateway: 'online',
    timestamp: new Date().toISOString(),
    rabbit,
    services
  };
}

async function collectQueues() {
  const queues = await fetchJson(
    `${config.rabbitManagementUrl}/api/queues/%2F`,
    { headers: { authorization: rabbitAuth() } },
    3000
  );
  return queues
    .map((queue) => ({
      name: queue.name,
      state: queue.state,
      messages: queue.messages || 0,
      ready: queue.messages_ready || 0,
      unacked: queue.messages_unacknowledged || 0,
      consumers: queue.consumers || 0,
      publishRate: queue.message_stats?.publish_details?.rate || 0,
      deliverRate: queue.message_stats?.deliver_get_details?.rate || 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function proxyRequest(req, res, prefix, targetBase) {
  const target = new URL(targetBase);
  const incoming = new URL(req.url, 'http://gateway.local');
  let targetPath = incoming.pathname.slice(prefix.length) || '/';
  if (!targetPath.startsWith('/')) targetPath = `/${targetPath}`;
  const targetUrl = `${targetPath}${incoming.search}`;

  const headers = {
    ...req.headers,
    host: target.host,
    'x-forwarded-host': req.headers.host || '',
    'x-forwarded-proto': 'http',
    'x-forwarded-prefix': prefix
  };

  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: targetUrl,
      method: req.method,
      headers
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    logger.error(`[gateway] proxy ${prefix} failed: ${err.message}`);
    if (!res.headersSent) {
      json(res, 502, { error: `Service unavailable behind ${prefix}` });
    } else {
      res.end();
    }
  });

  req.pipe(upstream);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname === '/health') {
      json(res, 200, {
        service: config.serviceName,
        status: 'ok',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (url.pathname === '/api/health' && req.method === 'GET') {
      json(res, 200, await collectHealth());
      return;
    }

    if (url.pathname === '/api/queues' && req.method === 'GET') {
      try {
        json(res, 200, { items: await collectQueues() });
      } catch (err) {
        json(res, 502, { error: 'RabbitMQ management unavailable', detail: err.message });
      }
      return;
    }

    if (url.pathname === '/user' || url.pathname === '/manage') {
      res.writeHead(302, { location: `${url.pathname}/` });
      res.end();
      return;
    }

    if (url.pathname === '/user' || url.pathname.startsWith('/user/')) {
      proxyRequest(req, res, '/user', config.orderUserUrl);
      return;
    }

    if (url.pathname === '/manage' || url.pathname.startsWith('/manage/')) {
      proxyRequest(req, res, '/manage', config.orderManageUrl);
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const content = await fs.readFile(path.join(publicDir, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(content);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/app.js') {
      const content = await fs.readFile(path.join(publicDir, 'app.js'));
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(content);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/styles.css') {
      const content = await fs.readFile(path.join(publicDir, 'styles.css'));
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(content);
      return;
    }

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    json(res, 404, { error: 'Route not found' });
  } catch (err) {
    logger.error(`[gateway] ${err.stack || err.message}`);
    json(res, 500, { error: err.message || 'Internal server error' });
  }
});

server.listen(config.port, '0.0.0.0', () => {
  logger.info(`[gateway] dashboard at http://0.0.0.0:${config.port}`);
});
