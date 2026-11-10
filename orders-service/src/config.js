export const config = {
  serviceName: 'orders-service',
  port: Number(process.env.PORT || 8091),
  dataDir: process.env.DATA_DIR || './data',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://orders:orders123@localhost:5672',
  exchange: 'orders',
  queue: 'orders-service.events',
  autoApproveMs: Number(process.env.AUTO_APPROVE_MS || 12000)
};
