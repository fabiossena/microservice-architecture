import { config } from './config.js';
import { Broker } from './infrastructure/broker.js';
import { createDb } from './infrastructure/db.js';
import { createOrderHandlers } from './application/orderHandlers.js';
import { startHttpServer, json } from './api/server.js';

const logger = console;
const db = createDb(config.dataDir);
const broker = new Broker({
  url: config.rabbitUrl,
  exchange: config.exchange,
  serviceName: config.serviceName,
  logger
});

const handlers = createOrderHandlers({
  db,
  broker,
  logger,
  autoApproveMs: config.autoApproveMs
});

const eventTypes = Object.keys(handlers).filter(
  (key) => key !== 'shutdown' && typeof handlers[key] === 'function'
);

broker.subscribe(config.queue, eventTypes, async (event) => {
  const handler = handlers[event.type];
  if (!handler) return;
  if (db.markProcessed(event.id, event.type)) {
    logger.info(`[orders] evento duplicado ignorado: ${event.type} (${event.id})`);
    return;
  }
  logger.info(`[orders] processando ${event.type} de ${event.source}`);
  await handler(event);
});

const server = startHttpServer({
  port: config.port,
  serviceName: config.serviceName,
  broker,
  logger,
  routes: [
    {
      method: 'GET',
      path: '/orders',
      handler: async (req, res) => {
        json(res, 200, {
          items: db.list(100).map((order) => ({
            ...order,
            items: JSON.parse(order.items)
          }))
        });
      }
    }
  ]
});

await broker.start();

async function shutdown(signal) {
  logger.info(`[orders] recebido ${signal}, encerrando...`);
  handlers.shutdown();
  server.close();
  await broker.stop();
  db.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
