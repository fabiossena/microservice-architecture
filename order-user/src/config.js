export const config = {
  serviceName: 'order-user',
  port: Number(process.env.PORT || 8081),
  dataDir: process.env.DATA_DIR || './data',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://orders:orders123@localhost:5672',
  exchange: 'orders',
  queue: 'order-user.notifications',
  catalogUrl: process.env.CATALOG_URL || 'http://localhost:8094'
};
