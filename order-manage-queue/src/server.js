import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

function validName(value) {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 40;
}

function requireOrderId(payload) {
  if (!payload?.orderId || typeof payload.orderId !== 'string') {
    throw Object.assign(new Error('Informe o código do pedido'), { statusCode: 400 });
  }
  return payload.orderId.slice(0, 80);
}

function requireTargetUser(payload) {
  const target = String(payload?.targetUser || '').trim();
  if (!validName(target)) {
    throw Object.assign(new Error('Informe o usuário de destino'), { statusCode: 400 });
  }
  return target;
}

function buildAction(operator, action, payload) {
  if (action === 'approve-order') {
    const orderId = requireOrderId(payload);
    const targetUser = requireTargetUser(payload);
    return {
      type: 'manager.order.approve',
      user: targetUser,
      payload: { orderId },
      message: `${operator} aprovou o pedido #${shortId(orderId)} do cliente ${targetUser}.`
    };
  }

  if (action === 'cancel-order') {
    const orderId = requireOrderId(payload);
    const targetUser = requireTargetUser(payload);
    return {
      type: 'manager.order.cancel',
      user: targetUser,
      payload: {
        orderId,
        reason: String(payload?.reason || 'Cancelamento solicitado pela operação').slice(0, 200)
      },
      message: `${operator} cancelou o pedido #${shortId(orderId)} do cliente ${targetUser}.`
    };
  }

  if (action === 'refund-payment') {
    const orderId = requireOrderId(payload);
    const targetUser = requireTargetUser(payload);
    return {
      type: 'manager.payment.refund',
      user: targetUser,
      payload: { orderId },
      message: `${operator} solicitou o reembolso do pedido #${shortId(orderId)} de ${targetUser}.`
    };
  }

  if (action === 'dispatch-delivery') {
    const orderId = requireOrderId(payload);
    const targetUser = requireTargetUser(payload);
    return {
      type: 'manager.delivery.dispatch',
      user: targetUser,
      payload: { orderId },
      message: `${operator} solicitou o despacho da entrega do pedido #${shortId(orderId)} de ${targetUser}.`
    };
  }

  if (action === 'restock') {
    const sku = String(payload?.sku || '').slice(0, 80);
    const quantity = Number(payload?.quantity);
    if (!sku) throw Object.assign(new Error('Selecione o SKU para reposição'), { statusCode: 400 });
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 999) {
      throw Object.assign(new Error('Quantidade de reposição inválida'), { statusCode: 400 });
    }
    return {
      type: 'manager.catalog.restock',
      user: '*',
      payload: { sku, quantity: Math.floor(quantity) },
      message: `${operator} solicitou reposição de ${Math.floor(quantity)} unidade(s) do SKU ${sku}.`
    };
  }

  if (action === 'reply-user') {
    const targetUser = requireTargetUser(payload);
    const text = String(payload?.message || '').trim().slice(0, 500);
    if (text.length < 2) throw Object.assign(new Error('Escreva a mensagem de resposta'), { statusCode: 400 });
    return {
      type: 'manager.reply',
      user: targetUser,
      payload: { targetUser, message: text },
      message: text
    };
  }

  if (action === 'broadcast') {
    const text = String(payload?.message || '').trim().slice(0, 500);
    if (text.length < 2) throw Object.assign(new Error('Escreva o comunicado'), { statusCode: 400 });
    return {
      type: 'manager.broadcast',
      user: '*',
      payload: {},
      message: text
    };
  }

  throw Object.assign(new Error('Ação não suportada'), { statusCode: 400 });
}

export function createManagerServer({
  port,
  serviceName,
  db,
  broker,
  catalogUrl,
  sseClients,
  logger
}) {
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
        const category = url.searchParams.get('category');
        const items = category && ['user', 'system', 'sent'].includes(category)
          ? db.listByCategory(category, 200)
          : db.list(300);
        json(res, 200, { items });
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
          logger.warn(`[manage] catálogo indisponível (${err.message}); usando fallback`);
          json(res, 200, { items: FALLBACK_CATALOG, source: 'fallback' });
        }
        return;
      }

      if (url.pathname === '/api/actions' && req.method === 'POST') {
        const body = await readJson(req);
        const operator = String(body.operator || 'Operação').trim().slice(0, 40);
        if (!validName(operator)) {
          json(res, 400, { error: 'Informe o nome do operador' });
          return;
        }
        if (!broker.connected) {
          json(res, 503, { error: 'Mensageria indisponível. Tente novamente em instantes.' });
          return;
        }

        const action = buildAction(operator, body.action, body.payload || {});
        const event = await broker.publish(action.type, {
          user: action.user,
          message: action.message,
          payload: { ...action.payload, targetUser: action.user }
        });

        const stored = {
          id: event.id,
          direction: 'out',
          category: 'sent',
          eventType: event.type,
          source: event.source,
          user: action.user,
          actor: operator,
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

      json(res, 404, { error: 'Rota não encontrada' });
    } catch (err) {
      logger.error(`[http] ${err.stack || err.message}`);
      json(res, err.statusCode || 500, { error: err.message || 'Erro interno' });
    }
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info(`[http] ${serviceName} ouvindo em http://0.0.0.0:${port}`);
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
