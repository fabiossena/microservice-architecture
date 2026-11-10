import { config } from './config.js';
import { Broker } from './infrastructure/broker.js';
import { createDb } from './infrastructure/db.js';
import { createNotificationHandler } from './application/notificationHandler.js';
import { startHttpServer, json } from './api/server.js';

const logger = console;
const db = createDb(config.dataDir);
const broker = new Broker({
  url: config.rabbitUrl,
  exchange: config.exchange,
  serviceName: config.serviceName,
  logger
});

const handler = createNotificationHandler({ db, broker, logger });

broker.subscribe(
  config.queue,
  ['order.*', 'catalog.*', 'payment.*', 'delivery.*', 'manager.reply', 'manager.broadcast'],
  async (event) => {
    logger.info(`[notify] recebido ${event.type} de ${event.source}`);
    await handler(event);
  }
);

const server = startHttpServer({
  port: config.port,
  serviceName: config.serviceName,
  broker,
  logger,
  routes: [
    {
      method: 'GET',
      path: '/notifications',
      handler: async (req, res, url) => {
        const user = url.searchParams.get('user');
        let items = db.list(200);
        if (user) items = items.filter((item) => item.user === user || item.user === '*');
        json(res, 200, { items });
      }
    }
  ]
});

await broker.start();

async function shutdown(signal) {
  logger.info(`[notify] recebido ${signal}, encerrando...`);
  server.close();
  await broker.stop();
  db.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
