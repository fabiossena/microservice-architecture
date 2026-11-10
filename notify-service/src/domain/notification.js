const TITLES = {
  'order.created': 'Order created',
  'order.confirmed': 'Order approved',
  'order.cancelled': 'Order cancelled',
  'order.cancel_rejected': 'Cancellation not allowed',
  'order.not_found': 'Order not found',
  'order.status': 'Order status',
  'catalog.reserved': 'Stock reserved',
  'catalog.rejected': 'Insufficient stock',
  'catalog.checked': 'Stock check',
  'catalog.restocked': 'Stock restocked',
  'catalog.released': 'Stock released',
  'payment.approved': 'Payment approved',
  'payment.declined': 'Payment declined',
  'payment.refunded': 'Refund processed',
  'payment.info': 'Payment information',
  'payment.retry_failed': 'Retry could not be processed',
  'delivery.assigned': 'Courier assigned',
  'delivery.dispatched': 'Order out for delivery',
  'delivery.delivered': 'Order delivered',
  'delivery.cancelled': 'Delivery cancelled',
  'delivery.eta': 'Delivery estimate',
  'delivery.info': 'Delivery information',
  'manager.reply': 'Message from operations',
  'manager.broadcast': 'General announcement'
};

const SEVERITIES = {
  'order.cancelled': 'warning',
  'order.cancel_rejected': 'warning',
  'order.not_found': 'error',
  'catalog.rejected': 'error',
  'payment.declined': 'error',
  'payment.retry_failed': 'error',
  'delivery.cancelled': 'warning',
  'payment.refunded': 'success',
  'payment.approved': 'success',
  'delivery.delivered': 'success',
  'order.confirmed': 'success',
  'catalog.reserved': 'success',
  'delivery.dispatched': 'info',
  'manager.reply': 'info',
  'manager.broadcast': 'info'
};

export function titleFor(type) {
  return TITLES[type] || 'System update';
}

export function severityFor(type) {
  return SEVERITIES[type] || 'info';
}

export function targetUserFor(event) {
  if (event.type === 'manager.broadcast') return '*';
  return event.payload?.targetUser || event.user || null;
}
