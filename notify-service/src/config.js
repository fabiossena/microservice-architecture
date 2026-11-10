export const config = {
  serviceName: 'notify-service',
  port: Number(process.env.PORT || 8095),
  dataDir: process.env.DATA_DIR || './data',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://orders:orders123@localhost:5672',
  exchange: 'orders',
  queue: 'notify-service.events'
};
