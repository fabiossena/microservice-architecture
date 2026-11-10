import http from 'node:http';

export function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(payload);
}

export async function readJson(req, limitBytes = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw Object.assign(new Error('Payload too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 });
  }
}

/**
 * Minimal HTTP server for health checks and read-only support data.
 * Business traffic between services flows through RabbitMQ.
 */
export function startHttpServer({ port, serviceName, broker, routes = [], logger = console }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type'
      });
      res.end();
      return;
    }

    try {
      if (url.pathname === '/health') {
        json(res, 200, {
          service: serviceName,
          status: broker.connected ? 'ok' : 'degraded',
          broker: broker.connected ? 'connected' : 'disconnected',
          uptimeSeconds: Math.round(process.uptime()),
          timestamp: new Date().toISOString()
        });
        return;
      }

      const route = routes.find((item) => item.method === req.method && item.path === url.pathname);
      if (!route) {
        json(res, 404, { error: 'Route not found' });
        return;
      }

      await route.handler(req, res, url);
    } catch (err) {
      logger.error(`[http] ${err.stack || err.message}`);
      json(res, err.statusCode || 500, { error: err.message || 'Internal server error' });
    }
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info(`[http] ${serviceName} listening on http://0.0.0.0:${port}`);
  });

  return server;
}
