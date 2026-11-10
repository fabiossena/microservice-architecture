export const config = {
  serviceName: 'delivery-service',
  port: Number(process.env.PORT || 8093),
  dataDir: process.env.DATA_DIR || './data',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://orders:orders123@localhost:5672',
  exchange: 'orders',
  queue: 'delivery-service.events',
  dispatchDelayMs: Number(process.env.DISPATCH_DELAY_MS || 5000),
  deliveryDelayMs: Number(process.env.DELIVERY_DELAY_MS || 15000)
};
