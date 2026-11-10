import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { json, readJson } from './http.js';
import { FALLBACK_CATALOG } from './catalogFallback.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ASSETS = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/app.js', 'app.js'],
  ['/styles.css', 'styles.css']
]);

function shortId(id) {
  return String(id || '').slice(0, 8);
}

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
}

function validUser(user) {
  return typeof user === 'string' && user.trim().length >= 2 && user.trim().length <= 40;
}

function requireOrderId(payload) {
  if (!payload?.orderId || typeof payload.orderId !== 'string') {
    throw Object.assign(new Error('Enter the order code'), { statusCode: 400 });
  }
  return payload.orderId.slice(0, 80);
}

function buildAction(user, action, payload) {
  if (action === 'place-order') {
    const sku = String(payload?.sku || '').slice(0, 80);
    const itemName = String(payload?.itemName || '').slice(0, 120);
    const quantity = Number(payload?.quantity);
    const unitPrice = Number(payload?.unitPrice);
    if (!sku || !itemName) throw Object.assign(new Error('Select a catalog item'), { statusCode: 400 });
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
      throw Object.assign(new Error('Invalid quantity'), { statusCode: 400 });
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw Object.assign(new Error('Invalid item price'), { statusCode: 400 });
    }
    const orderId = typeof payload?.orderId === 'string' && payload.orderId
      ? payload.orderId.slice(0, 80)
      : randomUUID();
    const total = Math.round(quantity * unitPrice * 100) / 100;
    return {
      type: 'user.order.place',
      payload: {
        orderId,
        items: [{ sku, name: itemName, quantity: Math.floor(quantity), unitPrice }],
        total
      },
      message: `${user} requested ${Math.floor(quantity)}x ${itemName} (${money(total)}) on order #${shortId(orderId)}.`
    };
  }

  if (action === 'cancel-order') {
    const orderId = requireOrderId(payload);
    return {
      type: 'user.order.cancel',
      payload: { orderId },
      message: `${user} requested cancellation of order #${shortId(orderId)}.`
    };
  }

  if (action === 'check-status') {
    const orderId = requireOrderId(payload);
    return {
      type: 'user.order.status',
      payload: { orderId },
      message: `${user} checked the status of order #${shortId(orderId)}.`
    };
  }

  if (action === 'retry-payment') {
    const orderId = requireOrderId(payload);
    return {
      type: 'user.payment.retry',
      payload: { orderId },
      message: `${user} requested a new payment attempt for order #${shortId(orderId)}.`
    };
  }

  if (action === 'delivery-eta') {
    const orderId = requireOrderId(payload);
    return {
      type: 'user.delivery.eta',
      payload: { orderId },
      message: `${user} checked the delivery ETA for order #${shortId(orderId)}.`
    };
  }

  if (action === 'check-stock') {
    const sku = String(payload?.sku || '').slice(0, 80);
    const itemName = String(payload?.itemName || sku).slice(0, 120);
    if (!sku) throw Object.assign(new Error('Select an item'), { statusCode: 400 });
    return {
      type: 'user.catalog.check',
      payload: { sku, itemName },
      message: `${user} checked stock for ${itemName}.`
    };
  }

  if (action === 'complaint') {
    const text = String(payload?.message || '').trim().slice(0, 500);
    if (text.length < 3) throw Object.assign(new Error('Describe your request'), { statusCode: 400 });
    return {
      type: 'user.support.complaint',
      payload: { message: text },
      message: `${user} opened a request for operations: ${text}`
    };
  }

  throw Object.assign(new Error('Unsupported action'), { statusCode: 400 });
}

export function createViewServer({ port, serviceName, db, broker, catalogUrl, sseClients, logger }) {
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

      if (url.pathname === '/api/stream' && req.method === 'GET') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
          'access-control-allow-origin': '*'
        });
        res.write('retry: 3000\n');
        res.write('event: ready\ndata: {"connected":true}\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (url.pathname === '/api/messages' && req.method === 'GET') {
        const user = url.searchParams.get('user');
        if (user) {
          if (!validUser(user)) {
            json(res, 400, { error: 'Invalid user' });
            return;
          }
          json(res, 200, { items: db.historyForUser(user.trim(), 100) });
        } else {
          json(res, 200, { items: db.listAll(200) });
        }
        return;
      }

      if (url.pathname === '/api/catalog' && req.method === 'GET') {
        try {
          const response = await fetch(`${catalogUrl}/catalog`, {
            signal: AbortSignal.timeout(2500)
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          json(res, 200, { items: data.items || [], source: 'catalog-service' });
        } catch (err) {
          logger.warn(`[order-user] catalog unavailable (${err.message}); using fallback`);
          json(res, 200, { items: FALLBACK_CATALOG, source: 'fallback' });
        }
        return;
      }

      if (url.pathname === '/api/actions' && req.method === 'POST') {
        const body = await readJson(req);
        const user = String(body.user || '').trim();
        if (!validUser(user)) {
          json(res, 400, { error: 'Choose a username with 2 to 40 characters' });
          return;
        }
        if (!broker.connected) {
          json(res, 503, { error: 'Messaging is unavailable. Try again shortly.' });
          return;
        }

        const action = buildAction(user, body.action, body.payload || {});
        const event = await broker.publish(action.type, {
          user,
          message: action.message,
          payload: action.payload
        });

        const stored = {
          id: event.id,
          direction: 'out',
          eventType: event.type,
          source: event.source,
          user,
          message: event.message,
          payload: event.payload,
          occurredAt: event.occurredAt,
          recordedAt: new Date().toISOString(),
          correlationId: event.correlationId
        };
        db.insert(stored);
        broadcast(sseClients, stored);
        json(res, 202, { item: stored });
        return;
      }

      if (req.method === 'GET' && ASSETS.has(url.pathname)) {
        const filename = ASSETS.get(url.pathname);
        const content = await fs.readFile(path.join(publicDir, filename));
        const mime = filename.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : filename.endsWith('.js')
            ? 'text/javascript; charset=utf-8'
            : 'text/css; charset=utf-8';
        res.writeHead(200, {
          'content-type': mime,
          'cache-control': 'no-cache',
          'access-control-allow-origin': '*'
        });
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
      logger.error(`[http] ${err.stack || err.message}`);
      json(res, err.statusCode || 500, { error: err.message || 'Internal server error' });
    }
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info(`[http] ${serviceName} listening on http://0.0.0.0:${port}`);
  });

  return server;
}

export function broadcast(sseClients, item) {
  const frame = `event: message\ndata: ${JSON.stringify(item)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(frame);
    } catch {
      sseClients.delete(client);
    }
  }
}
