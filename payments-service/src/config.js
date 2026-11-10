export const config = {
  serviceName: 'payments-service',
  port: Number(process.env.PORT || 8092),
  dataDir: process.env.DATA_DIR || './data',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://orders:orders123@localhost:5672',
  exchange: 'orders',
  queue: 'payments-service.events',
  paymentLimit: Number(process.env.PAYMENT_LIMIT || 1000)
};
