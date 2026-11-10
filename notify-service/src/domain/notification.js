const TITLES = {
  'order.created': 'Pedido criado',
  'order.confirmed': 'Pedido aprovado',
  'order.cancelled': 'Pedido cancelado',
  'order.cancel_rejected': 'Cancelamento não permitido',
  'order.not_found': 'Pedido não encontrado',
  'order.status': 'Status do pedido',
  'catalog.reserved': 'Estoque reservado',
  'catalog.rejected': 'Estoque insuficiente',
  'catalog.checked': 'Consulta de estoque',
  'catalog.restocked': 'Reposição de estoque',
  'catalog.released': 'Estoque liberado',
  'payment.approved': 'Pagamento aprovado',
  'payment.declined': 'Pagamento recusado',
  'payment.refunded': 'Reembolso processado',
  'payment.info': 'Informação de pagamento',
  'payment.retry_failed': 'Nova tentativa não realizada',
  'delivery.assigned': 'Entregador designado',
  'delivery.dispatched': 'Pedido em rota',
  'delivery.delivered': 'Pedido entregue',
  'delivery.cancelled': 'Entrega cancelada',
  'delivery.eta': 'Previsão de entrega',
  'delivery.info': 'Informação de entrega',
  'manager.reply': 'Mensagem da operação',
  'manager.broadcast': 'Comunicado geral'
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
  return TITLES[type] || 'Atualização do sistema';
}

export function severityFor(type) {
  return SEVERITIES[type] || 'info';
}

export function targetUserFor(event) {
  if (event.type === 'manager.broadcast') return '*';
  return event.payload?.targetUser || event.user || null;
}
