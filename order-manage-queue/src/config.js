export const config = {
  serviceName: 'order-manage-queue',
  port: Number(process.env.PORT || 8082),
  dataDir: process.env.DATA_DIR || './data',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://orders:orders123@localhost:5672',
  exchange: 'orders',
  queue: 'order-manage.inbox',
  catalogUrl: process.env.CATALOG_URL || 'http://localhost:8094'
};
