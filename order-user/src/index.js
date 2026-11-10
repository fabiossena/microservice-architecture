import { config } from './config.js';
import { Broker } from './infrastructure/broker.js';
import { createDb } from './db.js';
import { broadcast, createViewServer } from './server.js';

const logger = console;
const db = createDb(config.dataDir);
const sseClients = new Set();

const broker = new Broker({
  url: config.rabbitUrl,
  exchange: config.exchange,
  serviceName: config.serviceName,
  logger
});

broker.subscribe(config.queue, ['notification.created'], async (event) => {
  const stored = {
    id: event.id,
    direction: 'in',
    eventType: event.type,
    source: event.source,
    user: event.user,
    message: event.message,
    payload: {
      ...(event.payload || {}),
      title: event.payload?.title || 'Notificação',
      severity: event.payload?.severity || 'info'
    },
    occurredAt: event.occurredAt,
    recordedAt: new Date().toISOString(),
    correlationId: event.correlationId
  };

  if (!db.insert(stored)) return;
  broadcast(sseClients, stored);
});

const server = createViewServer({
  port: config.port,
  serviceName: config.serviceName,
  db,
  broker,
  catalogUrl: config.catalogUrl,
  sseClients,
  logger
});

const heartbeat = setInterval(() => {
  for (const client of sseClients) client.write(': keep-alive\n\n');
}, 20000);
heartbeat.unref?.();

broker.start().catch((err) => logger.error(`[order-user] ${err.message}`));

async function shutdown(signal) {
  logger.info(`[order-user] recebido ${signal}, encerrando...`);
  clearInterval(heartbeat);
  for (const client of sseClients) {
    try {
      client.end();
    } catch {
      // ignora
    }
  }
  server.close();
  await broker.stop();
  db.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
