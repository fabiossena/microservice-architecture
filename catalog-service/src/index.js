import { config } from './config.js';
import { Broker } from './infrastructure/broker.js';
import { createDb } from './infrastructure/db.js';
import { createCatalogHandlers } from './application/catalogHandlers.js';
import { startHttpServer, json } from './api/server.js';

const logger = console;
const db = createDb(config.dataDir);
const broker = new Broker({
  url: config.rabbitUrl,
  exchange: config.exchange,
  serviceName: config.serviceName,
  logger
});

const handlers = createCatalogHandlers({ db, broker, logger });
const eventTypes = Object.keys(handlers).filter(
  (key) => key !== 'shutdown' && typeof handlers[key] === 'function'
);

broker.subscribe(config.queue, eventTypes, async (event) => {
  if (db.markProcessed(event.id, event.type)) return;
  logger.info(`[catalog] processando ${event.type} de ${event.source}`);
  await handlers[event.type](event);
});

const server = startHttpServer({
  port: config.port,
  serviceName: config.serviceName,
  broker,
  logger,
  routes: [
    {
      method: 'GET',
      path: '/catalog',
      handler: async (req, res) => {
        json(res, 200, { items: db.list() });
      }
    }
  ]
});

await broker.start();

async function shutdown(signal) {
  logger.info(`[catalog] recebido ${signal}, encerrando...`);
  server.close();
  await broker.stop();
  db.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
