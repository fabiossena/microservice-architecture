export const config = {
  serviceName: 'api-gateway',
  port: Number(process.env.PORT || 8080),
  orderUserUrl: process.env.ORDER_USER_URL || 'http://localhost:8081',
  orderManageUrl: process.env.ORDER_MANAGE_URL || 'http://localhost:8082',
  rabbitManagementUrl: process.env.RABBITMQ_MANAGEMENT_URL || 'http://localhost:15672',
  rabbitUser: process.env.RABBITMQ_USER || 'orders',
  rabbitPassword: process.env.RABBITMQ_PASSWORD || 'orders123',
  services: [
    { name: 'orders-service', url: process.env.ORDERS_SERVICE_URL || 'http://localhost:8091' },
    { name: 'catalog-service', url: process.env.CATALOG_SERVICE_URL || 'http://localhost:8094' },
    { name: 'payments-service', url: process.env.PAYMENTS_SERVICE_URL || 'http://localhost:8092' },
    { name: 'delivery-service', url: process.env.DELIVERY_SERVICE_URL || 'http://localhost:8093' },
    { name: 'notify-service', url: process.env.NOTIFY_SERVICE_URL || 'http://localhost:8095' },
    { name: 'order-user', url: process.env.ORDER_USER_URL || 'http://localhost:8081' },
    { name: 'order-manage-queue', url: process.env.ORDER_MANAGE_URL || 'http://localhost:8082' }
  ]
};
