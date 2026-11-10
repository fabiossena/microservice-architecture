export const ORDER_STATUS = Object.freeze({
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  PAID: 'PAID',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED'
});

export const STATUS_LABELS = Object.freeze({
  PENDING_APPROVAL: 'Aguardando aprovação',
  CONFIRMED: 'Aprovado / em preparação',
  REJECTED: 'Rejeitado',
  PAID: 'Pagamento aprovado',
  PAYMENT_FAILED: 'Pagamento recusado',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Concluído'
});

const CLOSED_STATUSES = new Set([
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.REJECTED,
  ORDER_STATUS.COMPLETED
]);

export function shortId(id) {
  return String(id || '').slice(0, 8);
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function canCancel(status) {
  return !CLOSED_STATUSES.has(status);
}

export function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('O pedido precisa conter pelo menos um item');
  }

  return rawItems.map((item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!item.sku || !item.name) throw new Error('Item inválido: sku e nome são obrigatórios');
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 99) {
      throw new Error('Quantidade inválida');
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error('Preço unitário inválido');
    }
    return {
      sku: String(item.sku),
      name: String(item.name),
      quantity: Math.floor(quantity),
      unitPrice: Math.round(unitPrice * 100) / 100
    };
  });
}

export function buildOrder(event) {
  const payload = event.payload || {};
  if (!event.user) throw new Error('Usuário do pedido é obrigatório');
  if (!payload.orderId) throw new Error('orderId é obrigatório');

  const items = normalizeItems(payload.items);
  const total = Math.round(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100) / 100;

  return {
    id: String(payload.orderId),
    user: String(event.user),
    status: ORDER_STATUS.PENDING_APPROVAL,
    total,
    items,
    reason: null
  };
}

export function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}
