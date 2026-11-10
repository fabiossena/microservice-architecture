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
  PENDING_APPROVAL: 'Pending approval',
  CONFIRMED: 'Approved / preparing',
  REJECTED: 'Rejected',
  PAID: 'Payment approved',
  PAYMENT_FAILED: 'Payment declined',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed'
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
    throw new Error('Order must contain at least one item');
  }

  return rawItems.map((item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!item.sku || !item.name) throw new Error('Invalid item: sku and name are required');
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 99) {
      throw new Error('Invalid quantity');
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error('Invalid unit price');
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
  if (!event.user) throw new Error('Order user is required');
  if (!payload.orderId) throw new Error('orderId is required');

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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
}
