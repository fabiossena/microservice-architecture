export const config = {
  serviceName: 'catalog-service',
  port: Number(process.env.PORT || 8094),
  dataDir: process.env.DATA_DIR || './data',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://orders:orders123@localhost:5672',
  exchange: 'orders',
  queue: 'catalog-service.events'
};
